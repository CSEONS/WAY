import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { databaseFilename } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { plural } from "../utils/plural.js";
import { type BulkProductAiDraft, createBulkProductAiDraft } from "./aiDraftService.js";
import { measureTokens, recordUsage } from "./aiUsageService.js";
import { notifyStoreOwner } from "./notificationService.js";

// «Добавить много товаров» sorts the photos in the background: the AI may take
// a minute or two over 40 photos, and the owner doesn't have to wait on the
// page — or even keep the cabinet open. The photos (as uploaded) and the AI's
// answer wait in DATA_DIR/bulk-drafts/<id>/ next to job.json — not in the
// database: an AI draft is a temporary suggestion (DOMAIN_MODEL). An owner who
// isn't watching the page when the AI is done gets a notification (bell and
// phone) that opens the page where they left off. A sorting is kept for
// KEEP_DAYS days, until its products are published or until it's thrown away.

export type BulkDraftStatus = "RUNNING" | "DONE" | "ERROR";

interface BulkDraftJob {
  id: string;
  storeId: string;
  status: BulkDraftStatus;
  /** Mime type of each photo, by index; the photos are <index>.<ext> next to job.json. */
  photoTypes: string[];
  /** What the owner wrote for the AI: comes back with the photos. */
  prompt: string;
  expectedCount: number | null;
  createdAt: string;
  finishedAt: string | null;
  /** The AI's answer, once DONE. */
  drafts: BulkProductAiDraft[] | null;
  /** Why it failed, in words for the owner. */
  error: string | null;
  /** The owner's page asked about it lately: they see the result there, no notification needed. */
  watchedAt: string | null;
}

/** A sorting as the owner's page gets it. */
export type BulkDraft = Omit<BulkDraftJob, "photoTypes" | "watchedAt"> & { photoCount: number };

/** In the list: what it is and how far it got, without the AI's answer. */
export type BulkDraftSummary = Pick<BulkDraft, "id" | "status" | "photoCount" | "createdAt" | "finishedAt" | "error"> & { productCount: number };

export interface BulkUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface StartBulkDraftInput {
  images: BulkUploadFile[];
  voice?: BulkUploadFile;
  prompt?: string;
  /** How many products the owner roughly expects. */
  expectedCount?: number;
}

export const KEEP_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** A page that asked this recently is still open (it asks every few seconds). */
const WATCH_MS = 6000;
/** One store's sortings at a time: a repeated tap doesn't start a pile of them. */
const MAX_RUNNING = 2;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const GONE = `Раскладка не найдена: фото после ИИ хранятся ${KEEP_DAYS} ${plural(KEEP_DAYS, ["день", "дня", "дней"])}. Выберите их заново.`;

export function bulkDraftsDir() {
  return path.join(path.dirname(databaseFilename()), "bulk-drafts");
}

function jobDir(id: string) {
  return path.join(bulkDraftsDir(), id);
}

function photoName(index: number, mimetype: string) {
  return `${index}${EXTENSIONS[mimetype] ?? ".jpg"}`;
}

function readJob(id: string): BulkDraftJob | null {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(jobDir(id), "job.json"), "utf8")) as BulkDraftJob;
  } catch {
    return null;
  }
}

function writeJob(job: BulkDraftJob) {
  // Written aside and renamed: a reader never sees half a file.
  const file = path.join(jobDir(job.id), "job.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(job));
  fs.renameSync(`${file}.tmp`, file);
}

/**
 * Reads, changes and writes job.json in one go. Synchronous on purpose:
 * nothing else runs in between, so the AI's result and a page asking about it
 * at the same moment never undo each other. Null — the sorting is gone.
 */
function updateJob(id: string, change: (job: BulkDraftJob) => BulkDraftJob) {
  const job = readJob(id);
  if (!job) return null;
  const next = change(job);
  writeJob(next);
  return next;
}

function allJobs() {
  let names: string[] = [];
  try {
    names = fs.readdirSync(bulkDraftsDir());
  } catch {
    return [];
  }
  return names.flatMap((name) => readJob(name) ?? []);
}

function ownJob(storeId: string, id: string) {
  const job = readJob(id);
  if (!job || job.storeId !== storeId) throw new HttpError(404, GONE);
  return job;
}

function view({ photoTypes, watchedAt: _watchedAt, ...job }: BulkDraftJob): BulkDraft {
  return { ...job, photoCount: photoTypes.length };
}

function isWatched(job: BulkDraftJob, now = Date.now()) {
  return Boolean(job.watchedAt) && now - Date.parse(job.watchedAt!) < WATCH_MS;
}

function withPeriod(text: string) {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

// Sortings the AI is working on now: tests wait for them.
const running = new Set<Promise<void>>();

/** Waits until the AI has finished every sorting in progress. */
export async function bulkDraftsSettled() {
  while (running.size) await Promise.all(running);
}

/**
 * Saves the photos and hands them to the AI without waiting for it. The owner's
 * page asks how it's going (getBulkDraft); the limit is checked by the caller.
 */
export async function startBulkDraft(storeId: string, input: StartBulkDraftInput): Promise<BulkDraft> {
  const busy = allJobs().filter((job) => job.storeId === storeId && job.status === "RUNNING").length;
  if (busy >= MAX_RUNNING) throw new HttpError(429, "ИИ уже раскладывает фото этого магазина. Дождитесь, пока он закончит.");

  const id = crypto.randomUUID();
  const dir = jobDir(id);
  await fs.promises.mkdir(dir, { recursive: true });
  await Promise.all(input.images.map((image, index) => fs.promises.writeFile(path.join(dir, photoName(index, image.mimetype)), image.buffer)));
  const now = new Date().toISOString();
  const job: BulkDraftJob = {
    id,
    storeId,
    status: "RUNNING",
    photoTypes: input.images.map((image) => image.mimetype),
    prompt: input.prompt?.trim() ?? "",
    expectedCount: input.expectedCount ?? null,
    createdAt: now,
    finishedAt: null,
    drafts: null,
    error: null,
    // The owner is on the page that sent it.
    watchedAt: now
  };
  writeJob(job);

  const work = sort(job, input).finally(() => running.delete(work));
  running.add(work);
  return view(job);
}

async function sort(job: BulkDraftJob, input: StartBulkDraftInput) {
  let outcome: Pick<BulkDraftJob, "status" | "drafts" | "error">;
  try {
    const { result, usage } = await measureTokens(() =>
      createBulkProductAiDraft({ prompt: input.prompt, voice: input.voice, images: input.images, expectedCount: input.expectedCount })
    );
    await recordUsage(job.storeId, "BULK", result.length, usage);
    outcome = { status: "DONE", drafts: result, error: null };
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("Bulk sorting failed", error);
    outcome = { status: "ERROR", drafts: null, error: error instanceof HttpError ? error.message : "Не удалось разложить фото, попробуйте ещё раз" };
  }
  const finished = updateJob(job.id, (current) => ({ ...current, ...outcome, finishedAt: new Date().toISOString() }));
  // Thrown away while the AI worked, or the owner is looking at the page: nothing to tell.
  if (!finished || isWatched(finished)) return;
  await notifyFinished(finished);
}

/** «Фото разложены» or «Не удалось»: opens the page with this sorting. */
async function notifyFinished(job: BulkDraftJob) {
  const link = `/dashboard/stores/${job.storeId}/products/bulk?draft=${job.id}`;
  const photos = job.photoTypes.length;
  const products = job.drafts?.length ?? 0;
  await notifyStoreOwner(job.storeId, {
    source: "SYSTEM",
    ...(job.status === "DONE"
      ? {
          title: "Фото разложены по товарам",
          body: `ИИ разложил ${photos} фото на ${products} ${plural(products, ["товар", "товара", "товаров"])}. Проверьте раскладку и поставьте цены — раскладка ждёт ${KEEP_DAYS} ${plural(KEEP_DAYS, ["день", "дня", "дней"])}.`
        }
      : {
          title: "Не удалось разложить фото",
          body: `${withPeriod(job.error ?? "ИИ не ответил")} Фото сохранены: откройте и нажмите «Разложить заново».`
        }),
    link,
    topic: `bulk:${job.id}`
  });
}

/** One sorting. `watching` — the page is open and shows it (true) or was just left (false). */
export function getBulkDraft(storeId: string, id: string, watching?: boolean): BulkDraft {
  const job = ownJob(storeId, id);
  if (watching === undefined) return view(job);
  return view(updateJob(job.id, (current) => ({ ...current, watchedAt: watching ? new Date().toISOString() : null })) ?? job);
}

/** The store's sortings, newest first: the page offers to go on with one. */
export function listBulkDrafts(storeId: string): BulkDraftSummary[] {
  return allJobs()
    .filter((job) => job.storeId === storeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ id, status, photoTypes, createdAt, finishedAt, error, drafts }) => ({
      id,
      status,
      photoCount: photoTypes.length,
      productCount: drafts?.length ?? 0,
      createdAt,
      finishedAt,
      error
    }));
}

/** A photo of the sorting, for the page that continues it in another tab or after the cabinet was closed. */
export function bulkDraftPhoto(storeId: string, id: string, index: number) {
  const job = ownJob(storeId, id);
  if (!Number.isInteger(index) || index < 0 || index >= job.photoTypes.length) throw new HttpError(404, "Фото не найдено");
  return { file: path.join(jobDir(id), photoName(index, job.photoTypes[index])), type: job.photoTypes[index] };
}

/** Published or thrown away: the photos aren't needed any more. A sorting in progress stops being saved. */
export async function deleteBulkDraft(storeId: string, id: string) {
  ownJob(storeId, id);
  await fs.promises.rm(jobDir(id), { recursive: true, force: true });
}

/** Removes sortings older than KEEP_DAYS days (and leftovers of ones that were never saved whole). */
export async function cleanupBulkDrafts(now = new Date()) {
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(bulkDraftsDir());
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const dir = path.join(bulkDraftsDir(), name);
    const job = readJob(name);
    const since = job ? Date.parse(job.createdAt) : (await fs.promises.stat(dir).catch(() => null))?.mtimeMs;
    if (since == null || now.getTime() - since < KEEP_DAYS * DAY_MS) continue;
    await fs.promises.rm(dir, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

/**
 * After a restart nothing is sorting any more: what was in progress failed.
 * The owner is told, so they don't wait for it forever.
 */
export async function recoverBulkDrafts() {
  for (const job of allJobs().filter((item) => item.status === "RUNNING")) {
    const failed = updateJob(job.id, (current) => ({
      ...current,
      status: "ERROR",
      error: "Сервер перезапускался, пока ИИ раскладывал фото",
      finishedAt: new Date().toISOString(),
      watchedAt: null
    }));
    if (failed) await notifyFinished(failed);
  }
}

/** At start: fails what a restart interrupted and clears old sortings, then clears them hourly. */
export async function startBulkDrafts() {
  await recoverBulkDrafts();
  await cleanupBulkDrafts();
  setInterval(() => void cleanupBulkDrafts().catch((error) => console.error("Bulk drafts cleanup failed", error)), HOUR_MS).unref();
}
