import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-month-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.BACKUP_DIR = path.join(dir, "backups");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { createStore, getStore, updateStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { listPlans, savePlan } = await import("../src/services/planService.js");
const { listForUser } = await import("../src/services/notificationService.js");
const { reportText, sendMonthlyReports } = await import("../src/services/monthlyReportService.js");
const { databaseCopy } = await import("../src/services/backupService.js");

await initDatabase();
const db = await getDb();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000021", password: "secret123" }))!;
const lateOwner = (await createOwner({ name: "Должник", phone: "+79280000022", password: "secret123" }))!;
const now = new Date(2026, 9, 1, 9, 0); // 1 October: September is over
const september = (day: number) => new Date(2026, 8, day, 12, 0).toISOString();

const store = (await createStore({ ownerId: owner.id, name: "Платья", slug: "dresses", subscriptionEndsAt: new Date(2026, 10, 1).toISOString() }))!;
await db.run("UPDATE stores SET createdAt = ? WHERE id = ?", september(1), store.id);
// Unpaid since August: not in service in September.
const unpaid = (await createStore({ ownerId: lateOwner.id, name: "Долг", slug: "debt", subscriptionEndsAt: new Date(2026, 7, 20).toISOString() }))!;
await db.run("UPDATE stores SET createdAt = ? WHERE id = ?", september(1), unpaid.id);

const event = (type: string, createdAt: string, channel: string | null = null) =>
  db.run("INSERT INTO analytics_events (id, storeId, productId, type, channel, createdAt) VALUES (?, ?, NULL, ?, ?, ?)", crypto.randomUUID(), store.id, type, channel, createdAt);
for (let i = 0; i < 3; i += 1) await event("STORE_VIEW", september(10 + i));
await event("CONTACT_CLICK", september(15), "whatsapp");
await event("CONTACT_CLICK", september(16), "phone");
await event("STORE_VIEW", new Date(2026, 9, 1, 8, 0).toISOString()); // October: not in September's results

test("итоги месяца: по одному уведомлению на магазин, только тем, кого обслуживали", async () => {
  assert.equal(await sendMonthlyReports(now), 1);
  assert.equal(await sendMonthlyReports(now), 0, "sent once");

  const [notice] = (await listForUser(owner.id)).items;
  assert.equal(notice.title, "Итоги за сентябрь 2026");
  assert.equal(notice.source, "SYSTEM");
  assert.match(notice.body, /«Платья», итоги за сентябрь 2026\./);
  assert.match(notice.body, /Витрину открыли: 3 раза\./);
  assert.match(notice.body, /Написали или позвонили: 2 раза \(WhatsApp — 1, звонок — 1\)\./);
  assert.equal(notice.link, null, "no link: results can't be opened in the app on this plan");
  assert.equal((await listForUser(lateOwner.id)).items.length, 0);
});

test("текст итогов подсказывает, что делать, если витрину не открывали", () => {
  const text = reportText("Пусто", {
    month: "2026-09",
    storeViews: 0,
    productViews: 0,
    contactClicks: 0,
    contactsByChannel: { whatsapp: 0, telegram: 0, instagram: 0, vk: 0, phone: 0 },
    newProducts: 0,
    topProducts: []
  });
  assert.match(text, /Написали или позвонили: 0 раз\.\n/);
  assert.match(text, /Витрину не открывали/);
});

test("галочка «Итоги в любой день» сохраняется в тарифе", async () => {
  const [plan] = await listPlans();
  assert.equal(plan.reportsAnytime, 0, "off by default");
  const saved = await savePlan(plan.id, { ...plan, reportsAnytime: 1 });
  assert.equal(saved.reportsAnytime, 1);
  const kept = await savePlan(plan.id, { ...plan, reportsAnytime: undefined });
  assert.equal(kept.reportsAnytime, 0, "an old client without the field switches it off");
});

test("отклонённый магазин: витрина выключена, итоги ему не идут, оплата возвращает", async () => {
  const declined = await updateStore(store.id, { isActive: 0, servingEndedAt: new Date().toISOString() });
  assert.equal(declined?.isActive, 0);
  assert.ok(declined?.servingEndedAt);
  assert.equal(await sendMonthlyReports(new Date(2026, 10, 1, 9, 0)), 0);

  const back = await updateStore(store.id, { isActive: 1, subscriptionEndsAt: new Date(2026, 11, 1).toISOString() });
  assert.equal(back?.isActive, 1);
  assert.equal(back?.servingEndedAt, null, "served again");
  assert.equal((await getStore(store.id))?.servingEndedAt, null);
});

test("копия базы для скачивания: gzip с настоящей базой SQLite", async () => {
  const { name, data } = await databaseCopy();
  assert.match(name, /^database-.+\.sqlite\.gz$/);
  const sqlite = zlib.gunzipSync(data);
  assert.equal(sqlite.subarray(0, 15).toString("utf8"), "SQLite format 3");
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
