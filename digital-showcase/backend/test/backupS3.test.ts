import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-s3-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.BACKUP_DIR = path.join(dir, "backups");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "admin-test-password";
process.env.TELEGRAM_BOT_TOKEN = "";

const { signV4 } = await import("../src/utils/s3.js");

// A tiny S3: keeps objects in memory and checks every request's signature
// exactly as a real storage would, from what actually arrived over the wire.
const ACCESS_KEY = "test-access";
const SECRET_KEY = "test-secret";
const objects = new Map<string, { body: Buffer; lastModified: Date }>();
const rejected: string[] = [];

const fakeS3 = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const signedHeaders = /SignedHeaders=([^,]+)/.exec(req.headers.authorization ?? "")?.[1]?.split(";") ?? [];
    const expected = signV4({
      method: req.method!,
      url,
      headers: Object.fromEntries(signedHeaders.map((name) => [name, String(req.headers[name] ?? "")])),
      payloadHash: String(req.headers["x-amz-content-sha256"]),
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      region: "ru-central1"
    });
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
    if (expected !== req.headers.authorization || bodyHash !== req.headers["x-amz-content-sha256"]) {
      rejected.push(`${req.method} ${req.url}`);
      res.statusCode = 403;
      res.end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
      return;
    }

    const key = decodeURIComponent(url.pathname.replace(/^\/backups-bucket\/?/, ""));
    if (req.method === "PUT") {
      objects.set(key, { body, lastModified: new Date() });
      res.end();
    } else if (req.method === "DELETE") {
      objects.delete(key);
      res.statusCode = 204;
      res.end();
    } else if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const contents = [...objects.entries()]
        .filter(([name]) => name.startsWith(prefix))
        .map(([name, object]) => `<Contents><Key>${name}</Key><Size>${object.body.length}</Size><LastModified>${object.lastModified.toISOString()}</LastModified></Contents>`)
        .join("");
      res.end(`<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
    } else if (req.method === "GET" && objects.has(key)) {
      res.end(objects.get(key)!.body);
    } else {
      res.statusCode = 404;
      res.end("<Error><Code>NoSuchKey</Code></Error>");
    }
  });
});
fakeS3.listen(0);

process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${(fakeS3.address() as AddressInfo).port}`;
process.env.BACKUP_S3_REGION = "ru-central1";
process.env.BACKUP_S3_BUCKET = "backups-bucket";
process.env.BACKUP_S3_ACCESS_KEY = ACCESS_KEY;
process.env.BACKUP_S3_SECRET_KEY = SECRET_KEY;
process.env.BACKUP_S3_PREFIX = "shop";
process.env.BACKUP_KEEP_DAYS = "30";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const { runBackup, verifyRemoteRestore } = await import("../src/services/backupService.js");

await initDatabase();
fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.UPLOAD_DIR, "photo-one.webp"), "one");
fs.writeFileSync(path.join(process.env.UPLOAD_DIR, "фото (2).webp"), "two");

test("копия и фото уходят в хранилище с правильной подписью", async () => {
  const run = await runBackup();
  assert.equal(run.status, "OK", run.error ?? "");
  assert.equal(run.target, "local+s3");
  assert.equal(run.uploadedFiles, 2);
  assert.deepEqual(rejected, []);
  assert.ok([...objects.keys()].some((key) => /^shop\/db\/database-.*\.sqlite\.gz$/.test(key)));
  assert.ok(objects.has("shop/uploads/photo-one.webp"));
  assert.ok(objects.has("shop/uploads/фото (2).webp"));
});

test("повторная копия отправляет только новые фото", async () => {
  fs.writeFileSync(path.join(process.env.UPLOAD_DIR!, "photo-three.webp"), "three");
  const run = await runBackup();
  assert.equal(run.uploadedFiles, 1);
});

test("старые копии базы удаляются из хранилища, фото остаются", async () => {
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  objects.set("shop/db/database-2020-01-01T04-00-00Z.sqlite.gz", { body: Buffer.from("old"), lastModified: old });
  objects.set("shop/uploads/old-photo.webp", { body: Buffer.from("old photo"), lastModified: old });
  await runBackup();
  assert.ok(!objects.has("shop/db/database-2020-01-01T04-00-00Z.sqlite.gz"));
  assert.ok(objects.has("shop/uploads/old-photo.webp"));
});

test("проверка восстановления скачивает последнюю копию и открывает её", async () => {
  const check = await verifyRemoteRestore();
  assert.ok(check);
  assert.equal(check.users, 1);
  assert.equal(check.photos, 4);
});

test("неверный ключ — копия помечается неудачной", async () => {
  process.env.BACKUP_S3_SECRET_KEY = "wrong-secret";
  const run = await runBackup();
  process.env.BACKUP_S3_SECRET_KEY = SECRET_KEY;
  assert.equal(run.status, "FAILED");
  assert.match(run.error ?? "", /403 SignatureDoesNotMatch/);
});

test.after(() => {
  fakeS3.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
