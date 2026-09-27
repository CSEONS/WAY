import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { databaseFilename, getDb, rawDb } from "../database/db.js";
import { S3Client } from "../utils/s3.js";
import { sendTelegram } from "../utils/telegram.js";
import { uploadDir } from "./imageService.js";
import { reportProblem } from "./alertService.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface BackupRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "OK" | "FAILED";
  target: string;
  databaseBytes: number | null;
  uploadedFiles: number | null;
  error: string | null;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Settings from .env (BACKUP_*). S3 is optional: without it copies stay on this server only. */
export function backupSettings() {
  const s3 =
    process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_ACCESS_KEY && process.env.BACKUP_S3_SECRET_KEY
      ? {
          endpoint: process.env.BACKUP_S3_ENDPOINT || "https://storage.yandexcloud.net",
          region: process.env.BACKUP_S3_REGION || "ru-central1",
          bucket: process.env.BACKUP_S3_BUCKET,
          accessKey: process.env.BACKUP_S3_ACCESS_KEY,
          secretKey: process.env.BACKUP_S3_SECRET_KEY
        }
      : null;
  return {
    enabled: process.env.BACKUP_ENABLED !== "false",
    dir: process.env.BACKUP_DIR || path.join(path.dirname(databaseFilename()), "backups"),
    /** Local time of the daily copy. */
    hour: Math.min(23, Math.floor(numberEnv("BACKUP_HOUR", 4))),
    keepLocal: Math.max(1, Math.floor(numberEnv("BACKUP_KEEP_LOCAL", 7))),
    keepRemoteDays: Math.max(1, Math.floor(numberEnv("BACKUP_KEEP_DAYS", 30))),
    prefix: (process.env.BACKUP_S3_PREFIX || "showcase").replace(/^\/+|\/+$/g, ""),
    s3
  };
}

const MIME: Record<string, string> = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

/** Opens a database file read-only and checks it is whole and has data. */
export function verifyDatabaseFile(file: string) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`integrity_check: ${integrity}`);
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number }).count;
    return { users: count("users"), stores: count("stores"), products: count("products"), payments: count("payments") };
  } finally {
    db.close();
  }
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

/** Keeps the newest `keep` local database copies. */
function pruneLocal(dir: string, keep: number) {
  const copies = fs
    .readdirSync(dir)
    .filter((name) => /^database-.*\.sqlite\.gz$/.test(name))
    .sort()
    .reverse();
  for (const name of copies.slice(keep)) fs.rmSync(path.join(dir, name), { force: true });
}

/** Sends photos the bucket doesn't have yet. Returns how many were sent. */
async function syncUploads(client: S3Client, prefix: string) {
  const db = await getDb();
  const sent = new Set((await db.all<{ name: string }>("SELECT name FROM backup_uploaded_files")).map((row) => row.name));
  const dir = uploadDir();
  if (!fs.existsSync(dir)) return 0;
  const pending = fs.readdirSync(dir).filter((name) => !sent.has(name) && fs.statSync(path.join(dir, name)).isFile());

  let count = 0;
  // A few at a time: fast enough, gentle on a small server.
  for (let index = 0; index < pending.length; index += 4) {
    await Promise.all(
      pending.slice(index, index + 4).map(async (name) => {
        const body = await fs.promises.readFile(path.join(dir, name));
        await client.put(`${prefix}/uploads/${name}`, body, MIME[path.extname(name).toLowerCase()]);
        await db.run("INSERT OR IGNORE INTO backup_uploaded_files (name, uploadedAt) VALUES (?, ?)", name, new Date().toISOString());
        count += 1;
      })
    );
  }
  return count;
}

/** Deletes database copies older than the retention period from the bucket. Photos are kept. */
async function pruneRemote(client: S3Client, prefix: string, keepDays: number) {
  const cutoff = Date.now() - keepDays * DAY_MS;
  const copies = await client.list(`${prefix}/db/`);
  for (const copy of copies) {
    if (Date.parse(copy.lastModified) < cutoff) await client.delete(copy.key);
  }
}

let running: Promise<BackupRun> | null = null;

/**
 * One backup: a consistent copy of the live database (SQLite online backup),
 * checked by opening it, gzipped into the backups folder and, when S3 is set,
 * sent to the bucket together with new photos. Failures reach Telegram.
 */
export function runBackup(): Promise<BackupRun> {
  running ??= doBackup().finally(() => {
    running = null;
  });
  return running;
}

async function doBackup(): Promise<BackupRun> {
  const settings = backupSettings();
  const db = await getDb();
  const run: BackupRun = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "RUNNING",
    target: settings.s3 ? "local+s3" : "local",
    databaseBytes: null,
    uploadedFiles: null,
    error: null
  };
  await db.run("INSERT INTO backup_runs (id, startedAt, status, target) VALUES (?, ?, 'RUNNING', ?)", run.id, run.startedAt, run.target);

  const temp = path.join(os.tmpdir(), `showcase-backup-${run.id}.sqlite`);
  try {
    fs.mkdirSync(settings.dir, { recursive: true });
    await rawDb().backup(temp);
    verifyDatabaseFile(temp);

    const compressed = await gzip(await fs.promises.readFile(temp));
    const name = `database-${stamp()}.sqlite.gz`;
    await fs.promises.writeFile(path.join(settings.dir, name), compressed);
    pruneLocal(settings.dir, settings.keepLocal);
    run.databaseBytes = compressed.length;

    if (settings.s3) {
      const client = new S3Client(settings.s3);
      await client.put(`${settings.prefix}/db/${name}`, compressed, "application/gzip");
      run.uploadedFiles = await syncUploads(client, settings.prefix);
      await pruneRemote(client, settings.prefix, settings.keepRemoteDays);
    }
    run.status = "OK";
  } catch (error) {
    run.status = "FAILED";
    run.error = error instanceof Error ? error.message : String(error);
    await reportProblem("Резервная копия не сделана", error);
  } finally {
    fs.rmSync(temp, { force: true });
    run.finishedAt = new Date().toISOString();
    await db.run(
      "UPDATE backup_runs SET finishedAt = ?, status = ?, databaseBytes = ?, uploadedFiles = ?, error = ? WHERE id = ?",
      run.finishedAt,
      run.status,
      run.databaseBytes,
      run.uploadedFiles,
      run.error,
      run.id
    );
  }
  return run;
}

export async function listBackupRuns(limit = 10) {
  const db = await getDb();
  return db.all<BackupRun>("SELECT * FROM backup_runs ORDER BY startedAt DESC LIMIT ?", limit);
}

export async function lastSuccessfulBackup() {
  const db = await getDb();
  return db.get<BackupRun>("SELECT * FROM backup_runs WHERE status = 'OK' ORDER BY startedAt DESC LIMIT 1");
}

/**
 * The monthly restore drill, automated: downloads the newest copy from the
 * bucket, unpacks it and opens it like a restore would. Reports to Telegram.
 */
export async function verifyRemoteRestore() {
  const settings = backupSettings();
  if (!settings.s3) return null;
  const client = new S3Client(settings.s3);
  const copies = (await client.list(`${settings.prefix}/db/`)).sort((a, b) => a.key.localeCompare(b.key));
  const newest = copies[copies.length - 1];
  if (!newest) throw new Error("В хранилище нет ни одной копии базы");

  const temp = path.join(os.tmpdir(), `showcase-restore-check-${Date.now()}.sqlite`);
  try {
    await fs.promises.writeFile(temp, await gunzip(await client.get(newest.key)));
    const counts = verifyDatabaseFile(temp);
    const photos = (await client.list(`${settings.prefix}/uploads/`)).length;
    return { key: newest.key, ...counts, photos };
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/** Unpacks a local or downloaded copy for scripts/restoreBackup. */
export async function unpackBackup(file: Buffer) {
  return file.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) ? gunzip(file) : file;
}

let timer: NodeJS.Timeout | null = null;

function msUntilNextRun(hour: number, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Daily copy at BACKUP_HOUR; a missed one (server was off) runs a few minutes
 * after start. On the 1st of each month the newest bucket copy is test-restored.
 */
export async function startBackupSchedule() {
  const settings = backupSettings();
  if (!settings.enabled || timer) return;
  if (!settings.s3) console.warn("Backups are kept on this server only: set BACKUP_S3_* in .env to copy them to object storage");

  const last = await lastSuccessfulBackup();
  if (!last || Date.now() - Date.parse(last.startedAt) > 26 * HOUR_MS) {
    setTimeout(() => void runBackup(), 5 * 60 * 1000).unref();
  }

  const scheduleNext = () => {
    timer = setTimeout(async () => {
      const run = await runBackup();
      if (run.status === "OK" && new Date().getDate() === 1 && settings.s3) {
        try {
          const check = await verifyRemoteRestore();
          if (check) {
            console.log(`Monthly restore check passed: ${check.key}`);
            await sendTelegram(
              `✅ Проверка восстановления прошла: ${check.key}. В копии ${check.stores} магазинов, ${check.products} товаров, ${check.photos} фото в хранилище.`,
              "alerts"
            );
          }
        } catch (error) {
          await reportProblem("Проверка восстановления из копии не прошла", error);
        }
      }
      scheduleNext();
    }, msUntilNextRun(settings.hour));
    timer.unref();
  };
  scheduleNext();
}
