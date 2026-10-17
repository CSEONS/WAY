import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-packages-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const packages = await import("../src/services/packageService.js");
const { cancelPayment, listPayments, revenueByMonth } = await import("../src/services/paymentService.js");
const { createStore, getStore, updateStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { aiAllowed, aiStatus, assertWithinLimit, recordUsage } = await import("../src/services/aiUsageService.js");
const { packageSchema, parseBody } = await import("../src/utils/validation.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000005", password: "secret123" }))!;
const tokens = { inputTokens: 100, outputTokens: 50 };

const mix = { name: "Старт", price: 500, description: "Превью и карточки", previews: 5, fills: 20, isService: 0, isPublic: 1 };

test("новая база: три пакета-примера, скрыты, пока админ не проверит цены", async () => {
  const list = await packages.listPackages();
  assert.deepEqual(
    list.map((item) => [item.name, item.previews, item.fills, item.isService, item.isPublic]),
    [
      ["+10 ИИ-превью", 10, 0, 0, 0],
      ["+100 карточек с ИИ", 0, 100, 0, 0],
      ["Помощь с первым заполнением", 0, 0, 1, 0]
    ]
  );
  assert.deepEqual(await packages.publicPackages(), []);
});

test("форма пакета: пустой не сохранить, «1 000» — это 1000", async () => {
  assert.throws(() => parseBody(packageSchema, { ...mix, previews: "", fills: 0 }), /Что в пакете/);
  assert.equal(parseBody(packageSchema, { ...mix, price: "1 000" }).price, 1000);
  await assert.rejects(packages.savePackage(null, { ...mix, previews: 0, fills: 0 }), /ничего нет/);

  const saved = await packages.savePackage(null, mix);
  assert.deepEqual((await packages.publicPackages()).map((item) => [item.name, item.isService]), [["Старт", false]]);
  const others = (await packages.listPackages()).filter((item) => item.id !== saved.id).map((item) => item.id);
  const reordered = await packages.reorderPackages([saved.id, ...others]);
  assert.deepEqual(reordered.map((item) => item.id), [saved.id, ...others]);
});

test("тариф без ИИ + пакет: ИИ открывается, тратится докупленное", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Пакеты", slug: "packages-basic" }))!;
  assert.equal(store.planId, "basic");
  assert.equal(aiAllowed(store, "DRAFT"), false);
  await assert.rejects(assertWithinLimit(store, "DRAFT"), /закончились: 0 из 0/);

  const start = (await packages.listPackages()).find((item) => item.name === "Старт")!;
  const { order, payment, store: after } = await packages.sellPackage(store.id, { packageId: start.id, amount: 500, method: "CASH" }, null);
  assert.equal(order.status, "DONE");
  assert.equal(payment.months, 0);
  assert.equal(payment.periodEnd, null);
  assert.equal(payment.packageName, "Старт");
  assert.deepEqual([after.extraPreviews, after.extraFills], [5, 20]);
  // Money from packages counts as revenue, the paid date stays.
  assert.equal(after.subscriptionEndsAt, store.subscriptionEndsAt);
  assert.equal((await revenueByMonth(1))[0].total, 500);

  assert.equal(aiAllowed(after, "DRAFT"), true);
  await assertWithinLimit(after, "DRAFT");
  await recordUsage(store.id, "BULK", 3, tokens);
  await recordUsage(store.id, "PREVIEW", 1, tokens);
  const spent = (await getStore(store.id))!;
  assert.deepEqual([spent.extraPreviews, spent.extraFills], [4, 17]);
  // None of it counts against the plan's month.
  assert.equal((await aiStatus(spent)).used, 0);
});

test("тариф с ИИ: сначала месячный лимит, потом пакет; массовая загрузка делится", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "С ИИ", slug: "packages-ai", planId: "ai" }))!;
  await updateStore(store.id, { aiMonthlyLimit: 5 });
  const start = (await packages.listPackages()).find((item) => item.name === "Старт")!;
  await packages.sellPackage(store.id, { packageId: start.id, amount: 0, method: "OTHER" }, null);

  // 3 of the month's 5, then a bulk of 4: 2 from the month, 2 from the package.
  await recordUsage(store.id, "DRAFT", 3, tokens);
  await recordUsage(store.id, "BULK", 4, tokens);
  let current = (await getStore(store.id))!;
  assert.equal(current.extraFills, 18);
  assert.equal((await aiStatus(current)).used, 5);

  // The month is used up: a preview takes one package preview, cards go on from the package.
  await assertWithinLimit(current, "PREVIEW");
  await recordUsage(store.id, "PREVIEW", 2, tokens);
  await recordUsage(store.id, "DRAFT", 1, tokens);
  current = (await getStore(store.id))!;
  assert.deepEqual([current.extraPreviews, current.extraFills], [4, 17]);
  assert.equal((await aiStatus(current)).used, 5);

  // No package previews left: stopped with a way out.
  await updateStore(store.id, {});
  const { rawDb } = await import("../src/database/db.js");
  rawDb().prepare("UPDATE stores SET extraPreviews = 0 WHERE id = ?").run(store.id);
  await assert.rejects(assertWithinLimit((await getStore(store.id))!, "PREVIEW"), /ИИ-превью на этот месяц закончились.*Докупите пакет/);
});

test("запрос владельца → оплата админом; услуга ждёт «Выполнено»", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Услуга", slug: "packages-service" }))!;
  const help = (await packages.listPackages()).find((item) => item.isService)!;
  // Hidden packages can't be requested, only sold by the admin.
  await assert.rejects(packages.requestPackage(store.id, help.id), /Такого пакета нет/);
  await packages.savePackage(help.id, { ...help, isPublic: 1 });

  const request = await packages.requestPackage(store.id, help.id);
  assert.equal(request.status, "REQUESTED");
  await assert.rejects(packages.requestPackage(store.id, help.id), /уже отправлен/);
  assert.deepEqual(
    (await packages.openOrders()).map((order) => [order.storeName, order.status]),
    [["Услуга", "REQUESTED"]]
  );

  // The package's price changes later: the request keeps what was asked for.
  await packages.savePackage(help.id, { ...help, isPublic: 1, price: 1500 });
  const { order } = await packages.sellPackage(store.id, { orderId: request.id, amount: 1000, method: "TRANSFER" }, null);
  assert.equal(order.id, request.id);
  assert.equal(order.status, "PAID");
  assert.equal(order.price, 1000);
  await assert.rejects(packages.sellPackage(store.id, { orderId: request.id, amount: 1000, method: "TRANSFER" }, null), /уже обработан/);

  const done = await packages.completeService(order.id);
  assert.equal(done.status, "DONE");
  assert.deepEqual(await packages.openOrders(), []);
  assert.equal((await packages.listPackages()).find((item) => item.id === help.id)!.soldCount, 1);
});

test("владелец отзывает запрос, админ отклоняет", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Отзыв", slug: "packages-withdraw" }))!;
  const start = (await packages.listPackages()).find((item) => item.name === "Старт")!;
  const first = await packages.requestPackage(store.id, start.id);
  // Someone else's store can't touch it.
  await assert.rejects(packages.closeRequest(first.id, "CANCELLED", "other-store"), /не найден/);
  assert.equal((await packages.closeRequest(first.id, "CANCELLED", store.id)).status, "CANCELLED");

  const second = await packages.requestPackage(store.id, start.id);
  assert.equal((await packages.closeRequest(second.id, "DECLINED")).status, "DECLINED");
  assert.deepEqual(
    (await packages.listOrders(store.id)).map((order) => order.status),
    ["DECLINED", "CANCELLED"]
  );
});

test("отмена оплаты пакета забирает остаток, потраченное остаётся потраченным", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Отмена", slug: "packages-cancel" }))!;
  const start = (await packages.listPackages()).find((item) => item.name === "Старт")!;
  const { payment, order } = await packages.sellPackage(store.id, { packageId: start.id, amount: 500, method: "CASH" }, null);
  await recordUsage(store.id, "DRAFT", 2, tokens);

  const { rolledBack } = await cancelPayment(payment.id);
  assert.equal(rolledBack, false);
  const returned = await packages.returnPackage(payment.id);
  assert.equal(returned!.id, order.id);
  const after = (await getStore(store.id))!;
  assert.deepEqual([after.extraPreviews, after.extraFills], [0, 0]);
  assert.equal(after.subscriptionEndsAt, store.subscriptionEndsAt);
  assert.ok(!(await listPayments({ storeId: store.id })).length);
  assert.equal((await packages.listOrders(store.id))[0].status, "CANCELLED");
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
