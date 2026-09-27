import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-stage5-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.TRIAL_DAYS = "14";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { addMonths, subscriptionInfo, isStorefrontOpen } = await import("../src/services/subscriptionService.js");
const { slugify } = await import("../src/utils/slug.js");
const { createStore, getStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { acceptPayment, cancelPayment, revenueByMonth } = await import("../src/services/paymentService.js");
const aiUsage = await import("../src/services/aiUsageService.js");
const { connectStore, suggestSlug } = await import("../src/services/onboardingService.js");
const authService = await import("../src/services/authService.js");
const { listActions } = await import("../src/services/auditService.js");

await initDatabase();
const db = await getDb();
const admin = (await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN'"))!;
const owner = (await createOwner({ name: "Владелец", phone: "+79280000001", password: "secret123" }))!;
const DAY = 24 * 60 * 60 * 1000;

test("подписка: предупреждение за 7 дней, 3 дня отсрочки, потом витрина закрыта", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const store = (endsInDays: number) => ({ isActive: 1, subscriptionEndsAt: new Date(now + endsInDays * DAY).toISOString() });
  assert.equal(subscriptionInfo(store(20), now).state, "active");
  assert.equal(subscriptionInfo(store(7), now).state, "expiring");
  assert.equal(subscriptionInfo(store(3), now).daysLeft, 3);
  assert.equal(subscriptionInfo(store(-2), now).state, "grace");
  assert.equal(isStorefrontOpen(store(-2), now), true);
  assert.equal(subscriptionInfo(store(-4), now).state, "expired");
  assert.equal(isStorefrontOpen(store(-4), now), false);
  assert.equal(subscriptionInfo({ isActive: 1, subscriptionEndsAt: null }, now).state, "unlimited");
  assert.equal(isStorefrontOpen({ isActive: 0, subscriptionEndsAt: null }, now), false);
});

test("месяцы календарные: 31 января + 1 месяц = конец февраля", () => {
  assert.equal(addMonths(new Date(2026, 0, 31), 1).getDate(), 28);
  assert.equal(addMonths(new Date(2026, 10, 15), 3).getMonth(), 1);
});

test("slug из русского названия", () => {
  assert.equal(slugify("Бутик «Лейла» №1"), "butik-leyla-1");
  assert.equal(slugify("  Щука & Ёж  "), "schuka-ezh");
});

test("новый магазин без даты получает пробный период", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Пробный", slug: "trial-shop" }))!;
  const days = Math.round((Date.parse(store.subscriptionEndsAt!) - Date.now()) / DAY);
  assert.equal(days, 14);
});

test("занятый или кривой адрес — понятная ошибка 400, а не 500", async () => {
  await assert.rejects(createStore({ ownerId: owner.id, name: "Дубль", slug: "trial-shop" }), (error: { status?: number }) => error.status === 400);
  await assert.rejects(createStore({ ownerId: owner.id, name: "Кириллица", slug: "магазин" }), (error: { status?: number }) => error.status === 400);
});

test("оплата продлевает подписку от старой даты, отмена возвращает её назад", async () => {
  const endsAt = new Date(Date.now() + 5 * DAY).toISOString();
  const store = (await createStore({ ownerId: owner.id, name: "Оплаты", slug: "payments-shop", subscriptionEndsAt: endsAt }))!;

  const { payment, store: paid } = await acceptPayment(store.id, { amount: 1500, months: 1, method: "CASH" }, admin.id);
  assert.equal(payment.periodStart, endsAt);
  assert.equal(paid.subscriptionEndsAt, addMonths(new Date(endsAt), 1).toISOString());

  const revenue = await revenueByMonth(1);
  assert.equal(revenue[0].total >= 1500, true);

  const { rolledBack } = await cancelPayment(payment.id);
  assert.equal(rolledBack, true);
  assert.equal((await getStore(store.id))!.subscriptionEndsAt, endsAt);
});

test("оплата после отсрочки считается от сегодня, неверные данные — 400", async () => {
  const longAgo = new Date(Date.now() - 30 * DAY).toISOString();
  const store = (await createStore({ ownerId: owner.id, name: "Просрочен", slug: "late-shop", subscriptionEndsAt: longAgo }))!;
  const { store: paid } = await acceptPayment(store.id, { amount: 0, months: 1, method: "OTHER" }, admin.id);
  assert.ok(Date.parse(paid.subscriptionEndsAt!) > Date.now() + 27 * DAY);
  await assert.rejects(acceptPayment(store.id, { amount: -1, months: 1, method: "CASH" }, admin.id), (error: { status?: number }) => error.status === 400);
  await assert.rejects(acceptPayment(store.id, { amount: 100, months: 13, method: "CASH" }, admin.id), (error: { status?: number }) => error.status === 400);
});

test("лимит ИИ: после исчерпания запрос не уходит к провайдеру", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "ИИ", slug: "ai-shop", aiFormEnabled: 1, aiMonthlyLimit: 3 }))!;
  await aiUsage.recordUsage(store.id, "BULK", 2, { inputTokens: 1000, outputTokens: 200 });
  assert.deepEqual(await aiUsage.assertWithinLimit(store), { used: 2, limit: 3 });
  await aiUsage.recordUsage(store.id, "DRAFT", 1, { inputTokens: 10, outputTokens: 5 });
  await assert.rejects(aiUsage.assertWithinLimit(store), (error: { status?: number }) => error.status === 429);
});

test("токены собираются из ответов провайдера внутри одного запроса", async () => {
  const { usage } = await aiUsage.measureTokens(async () => {
    aiUsage.reportTokens({ input_tokens: 100, output_tokens: 20 });
    aiUsage.reportTokens({ input_tokens: 50, output_tokens: 5 });
  });
  assert.deepEqual(usage, { inputTokens: 150, outputTokens: 25 });
});

test("мастер подключения создаёт владельца и магазин, а при ошибке не оставляет владельца", async () => {
  const slug = await suggestSlug("Бутик Лейла");
  assert.equal(slug, "butik-leyla");
  const result = await connectStore(
    { ownerName: "Лейла", phone: "8 928 111-22-33", storeName: "Бутик Лейла", slug, withAi: true, trialDays: 7 },
    admin.id
  );
  assert.match(result.password, /^\d{8}$/);
  assert.equal(result.store.aiFormEnabled, 1);
  assert.equal(result.store.whatsapp, "8 928 111-22-33");
  assert.equal(await suggestSlug("Бутик Лейла"), "butik-leyla-2");

  const ownersBefore = (await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users"))!.count;
  await assert.rejects(
    connectStore({ ownerName: "Другой", phone: "+79281112233", storeName: "Дубль", slug: "other-shop", withAi: false, trialDays: 14 }, admin.id),
    /уже используется/
  );
  await assert.rejects(
    connectStore({ ownerName: "Третий", phone: "+79285556677", storeName: "Дубль", slug, withAi: false, trialDays: 14 }, admin.id),
    /уже занят/
  );
  assert.equal((await db.get<{ count: number }>("SELECT COUNT(*) as count FROM users"))!.count, ownersBefore);
  assert.equal((await listActions()).some((entry) => entry.action === "STORE_CONNECTED"), true);
});

test("вход от имени владельца: короткая сессия с пометкой, без отметки «заходил»", async () => {
  const { token } = await authService.impersonate(admin.id, owner.id);
  const jwt = (await import("jsonwebtoken")).default;
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; impersonatedBy: string; exp: number; iat: number };
  assert.equal(payload.userId, owner.id);
  assert.equal(payload.impersonatedBy, admin.id);
  assert.equal(payload.exp - payload.iat, 2 * 60 * 60);

  const me = await authService.me({ userId: owner.id, role: "OWNER", impersonatedBy: admin.id });
  assert.equal("impersonatedBy" in me && me.impersonatedBy?.id, admin.id);
  assert.equal((await db.get<{ lastSeenAt: string | null }>("SELECT lastSeenAt FROM users WHERE id = ?", owner.id))!.lastSeenAt, null);

  await authService.me({ userId: owner.id, role: "OWNER" });
  assert.notEqual((await db.get<{ lastSeenAt: string | null }>("SELECT lastSeenAt FROM users WHERE id = ?", owner.id))!.lastSeenAt, null);
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
