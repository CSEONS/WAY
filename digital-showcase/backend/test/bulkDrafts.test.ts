import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

// «Добавить много товаров» in the background: the AI sorts the photos while the
// owner is elsewhere; the result waits on disk and a notification calls them back.

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { messages: { content: unknown }[] };
    const user = body.messages[1].content as { type: string; text?: string }[];
    res.setHeader("Content-Type", "application/json");
    if ((user[0]?.text ?? "").includes("сломайся")) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: { message: "модель недоступна" } }));
      return;
    }
    const products = [
      { title: "Парка", colors: [{ name: "тёмно-коричневый", hex: "#4a3426" }], imageIndexes: [0, 1] },
      { title: "Шапка", imageIndexes: [2] }
    ];
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ products }) } }], usage: { prompt_tokens: 900, completion_tokens: 120 } }));
  });
});
server.listen(0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-bulk-drafts-test-"));
Object.assign(process.env, {
  DATABASE_URL: `file:${path.join(dir, "test.sqlite")}`,
  UPLOAD_DIR: path.join(dir, "uploads"),
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD: "test-password",
  JWT_SECRET: "test-secret-test-secret-test-secret",
  AI_API_KEY: "test-key",
  AI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
  AI_API_STYLE: "chat",
  AI_MODEL: "test-model"
});

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { createStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const bulk = await import("../src/services/bulkDraftService.js");

await initDatabase();
const db = await getDb();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000021", password: "secret123" }))!;
const other = (await createOwner({ name: "Другой", phone: "+79280000022", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "Мой магазин", slug: "bulk-shop" }))!;
const otherStore = (await createStore({ ownerId: other.id, name: "Чужой магазин", slug: "other-bulk-shop" }))!;

const photo = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#4a3426" } }).png().toBuffer();
const images = Array.from({ length: 3 }, (_, index) => ({ buffer: photo, mimetype: "image/png", originalname: `${index}.png`, size: photo.length }));

const notificationsFor = (userId: string) =>
  db.all<{ title: string; body: string; link: string | null }>("SELECT title, body, link FROM notifications WHERE userId = ? ORDER BY createdAt", userId);

test("владелец остался на странице: раскладка готова, ИИ учтён, уведомления нет", async () => {
  const started = await bulk.startBulkDraft(store.id, { images, prompt: "  куртки  ", expectedCount: 2 });
  assert.equal(started.status, "RUNNING");
  assert.equal(started.photoCount, 3);
  assert.equal(started.prompt, "куртки");
  assert.equal(fs.readdirSync(path.join(bulk.bulkDraftsDir(), started.id)).filter((name) => name.endsWith(".png")).length, 3);

  bulk.getBulkDraft(store.id, started.id, true);
  await bulk.bulkDraftsSettled();

  const done = bulk.getBulkDraft(store.id, started.id);
  assert.equal(done.status, "DONE");
  assert.deepEqual(done.drafts?.map((draft) => [draft.title, draft.imageIndexes, draft.status]), [
    ["Парка", [0, 1], "AVAILABLE"],
    ["Шапка", [2], "AVAILABLE"]
  ]);
  const usage = await db.get<{ kind: string; units: number; inputTokens: number }>("SELECT kind, units, inputTokens FROM ai_usage WHERE storeId = ?", store.id);
  assert.deepEqual({ ...usage }, { kind: "BULK", units: 2, inputTokens: 900 });
  assert.deepEqual(await notificationsFor(owner.id), [], "the owner saw it on the page");
});

test("владелец ушёл: по готовности — уведомление со ссылкой на раскладку", async () => {
  const started = await bulk.startBulkDraft(store.id, { images });
  bulk.getBulkDraft(store.id, started.id, false);
  await bulk.bulkDraftsSettled();

  const [notification] = await notificationsFor(owner.id);
  assert.equal(notification.title, "Фото разложены по товарам");
  assert.match(notification.body, /ИИ разложил 3 фото на 2 товара/);
  assert.equal(notification.link, `/dashboard/stores/${store.id}/products/bulk?draft=${started.id}`);
  await db.run("DELETE FROM notifications");
});

test("ИИ не справился: ошибка в раскладке и уведомление «Разложить заново»", async () => {
  const started = await bulk.startBulkDraft(store.id, { images, prompt: "сломайся" });
  bulk.getBulkDraft(store.id, started.id, false);
  await bulk.bulkDraftsSettled();

  const failed = bulk.getBulkDraft(store.id, started.id);
  assert.equal(failed.status, "ERROR");
  assert.match(failed.error ?? "", /модель недоступна/);
  const [notification] = await notificationsFor(owner.id);
  assert.equal(notification.title, "Не удалось разложить фото");
  assert.match(notification.body, /Разложить заново/);
  await db.run("DELETE FROM notifications");
});

test("раскладка видна только своему магазину; фото отдаются; удаление убирает всё", async () => {
  const started = await bulk.startBulkDraft(store.id, { images });
  await bulk.bulkDraftsSettled();

  assert.throws(() => bulk.getBulkDraft(otherStore.id, started.id), /Раскладка не найдена/);
  assert.throws(() => bulk.bulkDraftPhoto(otherStore.id, started.id, 0), /Раскладка не найдена/);
  assert.throws(() => bulk.getBulkDraft(store.id, "../../etc"), /Раскладка не найдена/);
  assert.throws(() => bulk.bulkDraftPhoto(store.id, started.id, 3), /Фото не найдено/);
  const first = bulk.bulkDraftPhoto(store.id, started.id, 0);
  assert.equal(first.type, "image/png");
  assert.deepEqual(fs.readFileSync(first.file), photo);
  assert.ok(bulk.listBulkDrafts(store.id).some((item) => item.id === started.id && item.productCount === 2));
  assert.ok(!bulk.listBulkDrafts(otherStore.id).length);

  await bulk.deleteBulkDraft(store.id, started.id);
  assert.ok(!fs.existsSync(path.join(bulk.bulkDraftsDir(), started.id)));
  assert.throws(() => bulk.getBulkDraft(store.id, started.id), /Раскладка не найдена/);
});

test("перезапуск: незаконченная раскладка — ошибка с уведомлением; старые удаляются", async () => {
  const id = crypto.randomUUID();
  const jobDir = path.join(bulk.bulkDraftsDir(), id);
  fs.mkdirSync(jobDir, { recursive: true });
  const createdAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(jobDir, "job.json"),
    JSON.stringify({ id, storeId: store.id, status: "RUNNING", photoTypes: ["image/png"], prompt: "", expectedCount: null, createdAt, finishedAt: null, drafts: null, error: null, watchedAt: createdAt })
  );

  await bulk.recoverBulkDrafts();
  const failed = bulk.getBulkDraft(store.id, id);
  assert.equal(failed.status, "ERROR");
  assert.match(failed.error ?? "", /Сервер перезапускался/);
  assert.equal((await notificationsFor(owner.id))[0]?.title, "Не удалось разложить фото");

  assert.equal(await bulk.cleanupBulkDrafts(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)), 0, "kept for three days");
  assert.ok((await bulk.cleanupBulkDrafts(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000))) >= 1);
  assert.ok(!fs.existsSync(jobDir));
});

test.after(() => {
  server.close();
  closeDb();
});
