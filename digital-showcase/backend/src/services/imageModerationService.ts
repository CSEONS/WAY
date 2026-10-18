import sharp from "sharp";
import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { completeJson, isAiConfigured } from "./aiProvider.js";
import { measureTokens } from "./aiUsageService.js";

// Photos must not show faces: of people and animals — alive, on photos,
// prints, drawings or toys — and of mannequins and dolls. A body without a
// face is fine: hands, legs, a model cut off at the nose, a person from the
// back — that's how clothes are shown. Every uploaded product photo and logo
// is checked by the AI model; a photo with a face goes to moderation and
// buyers don't see it until a moderator (the admin, for now) approves it.
// Nothing is painted over: the product just waits for the moderator's decision.

export interface LivingBeings {
  /** Short Russian descriptions: «лицо человека», «морда кота на принте». Empty — no faces. */
  found: string[];
}

export type ImageKind = "PRODUCT" | "LOGO";
export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

const INSTRUCTIONS = `Ты проверяешь фото для витрины магазина одежды. Найди на изображении только лица: лица людей и морды животных (включая птиц, рыб и насекомых) — настоящие или изображённые на фото, рисунках, принтах и вышивке на одежде, игрушках, а также лица манекенов и кукол.
Лицо считается, если видны глаза или большая часть лица. Не считаются: тело без лица — руки, ноги, торс, шея, силуэт; человек со спины; модель, у которой лицо обрезано кадром (видны только губы или подбородок) или закрыто; манекен без головы. Растения не считаются.
Ответ — только JSON-объект:
{"found": ["коротко по-русски, чьё лицо найдено, например «лицо человека», «морда кота на принте футболки»"]}
Если лиц нет — {"found": []}.`;

/** The model's answer, made safe: a few short strings. */
export function parseLivingBeings(answer: string): LivingBeings {
  let data: unknown;
  try {
    data = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch {
    throw new Error("ИИ ответил не JSON-объектом");
  }
  const raw = (data && typeof data === "object" ? data : {}) as { found?: unknown };
  return { found: cleanFindings(raw.found) };
}

/** At most 10 short descriptions — from the model or from the owner's form (see flagImage). */
export function cleanFindings(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Asks the AI model who is on the picture. Null when AI isn't configured.
 * The check is the service's own cost, not the owner's: its tokens are kept
 * out of the request that called it (a nested measureTokens).
 */
export async function findLivingBeings(image: Buffer): Promise<LivingBeings | null> {
  if (!isAiConfigured()) return null;
  const small = await sharp(image, { failOn: "error" }).rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const { result } = await measureTokens(() =>
    completeJson({
      instructions: INSTRUCTIONS,
      text: "Чьи лица есть на этой картинке? Ответь JSON.",
      images: [`data:image/jpeg;base64,${small.toString("base64")}`]
    })
  );
  return parseLivingBeings(result);
}

export interface ImageRef {
  url: string;
  kind: ImageKind;
  storeId: string;
  productId?: string | null;
}

/**
 * Sends a photo or logo to moderation with what was found on it. Used by the
 * check below and right on upload, when «Превью с ИИ» already checked the picture.
 */
export async function flagImage(ref: ImageRef, found: string[]) {
  const db = await getDb();
  await db.run(
    `INSERT INTO image_checks (id, url, kind, storeId, productId, status, findings, createdAt) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
     ON CONFLICT(url) DO UPDATE SET status = 'PENDING', findings = excluded.findings, reviewedBy = NULL, reviewedAt = NULL`,
    crypto.randomUUID(),
    ref.url,
    ref.kind,
    ref.storeId,
    ref.productId ?? null,
    found.join(", "),
    new Date().toISOString()
  );
}

/**
 * Checks an uploaded photo or logo; when a face is found, it waits for
 * moderation. Runs after the upload has answered, so failures are only
 * logged: the photo stays as it is.
 */
export async function checkImage(ref: ImageRef, image: Buffer) {
  try {
    const result = await findLivingBeings(image);
    if (!result?.found.length) return null;
    await flagImage(ref, result.found);
    return result;
  } catch (error) {
    console.error(`Image check failed for ${ref.url}:`, error);
    return null;
  }
}

/** SQL condition: the image at `column` may be shown to buyers (not waiting for moderation, not rejected). */
export function visibleToBuyers(column: string) {
  return `NOT EXISTS (SELECT 1 FROM image_checks c WHERE c.url = ${column} AND c.status IN ('PENDING', 'REJECTED'))`;
}

/** The store's logo for buyers: hidden while it waits for moderation or after a rejection. */
export async function publicLogo(logoUrl: string | null) {
  if (!logoUrl) return null;
  const db = await getDb();
  const check = await db.get<{ status: ModerationStatus }>("SELECT status FROM image_checks WHERE url = ?", logoUrl);
  return check && check.status !== "APPROVED" ? null : logoUrl;
}

/** Moderation of the given images, for the owner's own view: url → status and what was found. */
export async function moderationOf(urls: string[]) {
  if (!urls.length) return new Map<string, { status: ModerationStatus; findings: string }>();
  const db = await getDb();
  const rows = await db.all<{ url: string; status: ModerationStatus; findings: string }>(
    `SELECT url, status, findings FROM image_checks WHERE url IN (${urls.map(() => "?").join(", ")})`,
    urls
  );
  return new Map(rows.map((row) => [row.url, { status: row.status, findings: row.findings }]));
}

/** A replaced logo or a deleted photo needs no moderation any more. */
export async function forgetImage(url: string | null | undefined) {
  if (!url) return;
  const db = await getDb();
  await db.run("DELETE FROM image_checks WHERE url = ?", url);
}

export interface ImageCheck {
  id: string;
  url: string;
  kind: ImageKind;
  status: ModerationStatus;
  findings: string;
  createdAt: string;
  reviewedAt: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  productId: string | null;
  productTitle: string | null;
}

/** Images for the moderation page, newest first; only those still in use. */
export async function listChecks(status: ModerationStatus, limit = 200) {
  const db = await getDb();
  return db.all<ImageCheck>(
    `SELECT c.id, c.url, c.kind, c.status, c.findings, c.createdAt, c.reviewedAt, s.id as storeId, s.name as storeName, s.slug as storeSlug,
            p.id as productId, p.title as productTitle
     FROM image_checks c
     JOIN stores s ON s.id = c.storeId
     LEFT JOIN products p ON p.id = c.productId
     WHERE c.status = ?
       AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))
     ORDER BY c.createdAt DESC LIMIT ?`,
    status,
    limit
  );
}

export async function countPending() {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM image_checks c JOIN stores s ON s.id = c.storeId
     WHERE c.status = 'PENDING' AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))`
  );
  return row?.count ?? 0;
}

/** «Показывать» or «Скрыть»: the moderator's decision. */
export async function review(id: string, status: "APPROVED" | "REJECTED", reviewerId: string) {
  const db = await getDb();
  const check = await db.get<{ id: string; storeId: string }>("SELECT id, storeId FROM image_checks WHERE id = ?", id);
  if (!check) throw new HttpError(404, "Фото на проверке не найдено");
  await db.run("UPDATE image_checks SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?", status, reviewerId, new Date().toISOString(), id);
  return check;
}
