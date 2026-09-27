import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-backup-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.BACKUP_DIR = path.join(dir, "backups");
process.env.BACKUP_KEEP_LOCAL = "2";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "admin-test-password";
delete process.env.BACKUP_S3_BUCKET;
process.env.TELEGRAM_BOT_TOKEN = "";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const { createOwner } = await import("../src/services/userService.js");
const { createStore } = await import("../src/services/storeService.js");
const { createProduct } = await import("../src/services/productService.js");
const { listBackupRuns, runBackup, unpackBackup, verifyDatabaseFile } = await import("../src/services/backupService.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000001", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "Магазин", slug: "shop" }))!;
await createProduct({ storeId: store.id, title: "Платье" });

test("копия базы сжимается, проверяется и из неё можно восстановиться", async () => {
  const run = await runBackup();
  assert.equal(run.status, "OK", run.error ?? "");
  assert.equal(run.target, "local");

  const files = fs.readdirSync(process.env.BACKUP_DIR!).filter((name) => name.endsWith(".sqlite.gz"));
  assert.equal(files.length, 1);

  const restored = path.join(dir, "restored.sqlite");
  fs.writeFileSync(restored, await unpackBackup(fs.readFileSync(path.join(process.env.BACKUP_DIR!, files[0]))));
  assert.deepEqual(verifyDatabaseFile(restored), { users: 2, stores: 1, products: 1, payments: 0 });
});

test("хранится не больше BACKUP_KEEP_LOCAL копий, история пишется", async () => {
  for (let index = 0; index < 3; index++) {
    // Names carry the time to the second.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await runBackup();
  }
  assert.equal(fs.readdirSync(process.env.BACKUP_DIR!).filter((name) => name.endsWith(".sqlite.gz")).length, 2);
  const runs = await listBackupRuns();
  assert.equal(runs.length, 4);
  assert.ok(runs.every((run) => run.status === "OK"));
});

test("повреждённый файл не проходит проверку", () => {
  const broken = path.join(dir, "broken.sqlite");
  fs.writeFileSync(broken, "это не база данных");
  assert.throws(() => verifyDatabaseFile(broken));
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
