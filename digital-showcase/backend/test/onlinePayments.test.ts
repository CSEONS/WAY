import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-online-payments-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.PUBLIC_ORIGIN = "https://vitrina.test/";
delete process.env.TELEGRAM_BOT_TOKEN;

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const online = await import("../src/services/onlinePaymentService.js");
const { cancelPayment, listPayments } = await import("../src/services/paymentService.js");
const plans = await import("../src/services/planService.js");
const { createStore, getStore, updateStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { listForUser } = await import("../src/services/notificationService.js");
const { listActions } = await import("../src/services/auditService.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", email: "owner@shop.test", phone: "+79280000006", password: "secret123" }))!;
const plan = await plans.savePlan(null, {
  name: "Витрина + ИИ",
  price: 990,
  description: "",
  features: [],
  aiEnabled: 1,
  aiMonthlyLimit: 100,
  highlighted: 0,
  isPublic: 1
});

// ЮKassa as the tests need it: payments it created and what it says about them.
type Remote = { id: string; status: string; paid: boolean; amount: { value: string; currency: string }; metadata: Record<string, string> };
const remote = new Map<string, Remote>();
const requests: { method: string; url: string; headers: Record<string, string>; body: any }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
  const url = String(input);
  const headers = (init.headers ?? {}) as Record<string, string>;
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ method: init.method ?? "GET", url, headers, body });
  if (init.method === "POST" && url.endsWith("/v3/payments")) {
    const payment = { id: `yk-${remote.size + 1}`, status: "pending", paid: false, amount: body.amount, metadata: body.metadata };
    remote.set(payment.id, payment);
    return new Response(JSON.stringify({ ...payment, confirmation: { type: "redirect", confirmation_url: `https://yoomoney.test/checkout?id=${payment.id}` } }));
  }
  const found = remote.get(decodeURIComponent(url.split("/v3/payments/")[1] ?? ""));
  if (!found) return new Response(JSON.stringify({ type: "error", code: "not_found", description: "Payment not found" }), { status: 404 });
  return new Response(JSON.stringify(found));
}) as typeof fetch;

function setYookassa(on: boolean) {
  if (on) {
    process.env.YOOKASSA_SHOP_ID = "123456";
    process.env.YOOKASSA_SECRET_KEY = "test_secret";
  } else {
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
  }
}

/** The owner paid on ЮKassa's page. */
function pay(id: string, status: "succeeded" | "canceled" = "succeeded") {
  const payment = remote.get(id)!;
  payment.status = status;
  payment.paid = status === "succeeded";
}

const day = 24 * 60 * 60 * 1000;

test("онлайн-оплата есть, только когда ЮKassa настроена и у тарифа есть цена", async () => {
  const store = (await createStore({ ownerId: owner.id, name: "Платит сам", slug: "online-offer", planId: plan.id }))!;
  setYookassa(false);
  assert.equal(online.onlineOffer(store), null);

  setYookassa(true);
  assert.deepEqual(online.onlineOffer(store), { planName: "Витрина + ИИ", price: 990, months: [1, 3, 6, 12] });
  // «Цена по запросу», no end date, turned off by the admin: only through the admin.
  assert.equal(online.onlineOffer({ ...store, planId: "basic" }), null);
  assert.equal(online.onlineOffer({ ...store, subscriptionEndsAt: null }), null);
  assert.equal(online.onlineOffer({ ...store, isActive: 0 }), null);
  await assert.rejects(online.startOnlinePayment(store.id, 2, owner.id), /Период — 1, 3, 6, 12 мес/);
});

test("оплата на 3 месяца: платёж в ЮKassa, после оплаты подписка продлена один раз", async () => {
  setYookassa(true);
  const endsAt = new Date(Date.now() + 5 * day).toISOString();
  const store = (await createStore({ ownerId: owner.id, name: "Три месяца", slug: "online-three", planId: plan.id, subscriptionEndsAt: endsAt }))!;
  requests.length = 0;

  const started = await online.startOnlinePayment(store.id, 3, owner.id);
  assert.match(started.confirmationUrl, /^https:\/\/yoomoney\.test\/checkout/);
  const [create] = requests;
  assert.equal(create.headers["Idempotence-Key"], started.id);
  assert.equal(create.headers.Authorization, `Basic ${Buffer.from("123456:test_secret").toString("base64")}`);
  assert.deepEqual(create.body.amount, { value: "2970.00", currency: "RUB" });
  assert.equal(create.body.capture, true);
  assert.equal(create.body.confirmation.return_url, `https://vitrina.test/dashboard/stores/${store.id}/subscription?payment=${started.id}`);
  assert.deepEqual(create.body.metadata, { onlinePaymentId: started.id, storeId: store.id });
  assert.equal(create.body.receipt, undefined);

  // Not paid yet: nothing changes.
  assert.equal((await online.checkOnlinePayment(started.id, store.id)).status, "PENDING");
  assert.equal((await getStore(store.id))!.subscriptionEndsAt, endsAt);

  // Paid: the owner comes back and ЮKassa's notification arrives too — one extension.
  pay("yk-1");
  const [back, notified] = await Promise.all([
    online.checkOnlinePayment(started.id, store.id),
    online.handleNotification({ type: "notification", event: "payment.succeeded", object: { id: "yk-1", status: "succeeded" } })
  ]);
  assert.equal(back.status, "SUCCEEDED");
  assert.equal(notified?.status, "SUCCEEDED");
  await online.handleNotification({ type: "notification", event: "payment.succeeded", object: { id: "yk-1" } });

  const payments = await listPayments({ storeId: store.id });
  assert.equal(payments.length, 1);
  assert.deepEqual([payments[0].amount, payments[0].months, payments[0].method, payments[0].receipt], [2970, 3, "ONLINE", null]);
  const updated = (await getStore(store.id))!;
  assert.equal(updated.subscriptionEndsAt, payments[0].periodEnd);
  assert.equal(new Date(updated.subscriptionEndsAt!).getMonth(), (new Date(endsAt).getMonth() + 3) % 12);

  assert.ok((await listForUser(owner.id)).items.some((item) => item.title === "Оплата получена" && item.storeId === store.id));
  const entry = (await listActions()).find((item) => item.action === "PAYMENT_ONLINE" && item.targetId === store.id);
  assert.equal(entry?.actorName, "Владелец");
  // toLocaleString puts a no-break space between thousands.
  assert.match(entry?.details ?? "", /^2\s970 ₽ за 3 мес\., до /);

  // Cancelling it in «Оплаты» returns the date, as with any extension.
  assert.equal((await cancelPayment(payments[0].id)).rolledBack, true);
  assert.equal((await getStore(store.id))!.subscriptionEndsAt, endsAt);
});

test("отменённая оплата ничего не продлевает; чужие и выдуманные уведомления пропускаются", async () => {
  setYookassa(true);
  const store = (await createStore({ ownerId: owner.id, name: "Передумал", slug: "online-cancel", planId: plan.id }))!;
  const started = await online.startOnlinePayment(store.id, 1, owner.id);
  const externalId = `yk-${remote.size}`;
  pay(externalId, "canceled");
  assert.equal((await online.handleNotification({ event: "payment.canceled", object: { id: externalId } }))?.status, "CANCELED");
  assert.equal((await online.checkOnlinePayment(started.id, store.id)).status, "CANCELED");
  assert.equal((await listPayments({ storeId: store.id })).length, 0);

  assert.equal(await online.handleNotification({ event: "payment.succeeded", object: { id: "made-up" } }), null);
  remote.set("elsewhere", { id: "elsewhere", status: "succeeded", paid: true, amount: { value: "1.00", currency: "RUB" }, metadata: {} });
  assert.equal(await online.handleNotification({ event: "payment.succeeded", object: { id: "elsewhere" } }), null);
  assert.equal(await online.handleNotification({ event: "refund.succeeded", object: { id: externalId } }), null);
  assert.equal(await online.handleNotification(null), null);
  // Someone else's store: not found, as for any owner route.
  await assert.rejects(online.checkOnlinePayment(started.id, "another-store"), /Оплата не найдена/);
});

test("уведомление не пришло, владелец не вернулся: оплата применяется при открытии «Подписки»", async () => {
  setYookassa(true);
  const store = (await createStore({ ownerId: owner.id, name: "Закрыл вкладку", slug: "online-sync", planId: plan.id }))!;
  await online.startOnlinePayment(store.id, 12, owner.id);
  pay(`yk-${remote.size}`);
  await online.syncPending(store.id);
  const [payment] = await listPayments({ storeId: store.id });
  assert.deepEqual([payment.amount, payment.months, payment.method], [11880, 12, "ONLINE"]);
});

test("чек от ЮKassa: в платеже — покупатель и услуга, в оплате — «Чек от ЮKassa»", async () => {
  setYookassa(true);
  process.env.YOOKASSA_RECEIPTS = "on";
  process.env.YOOKASSA_VAT_CODE = "1";
  process.env.YOOKASSA_TAX_SYSTEM = "2";
  try {
    const store = (await createStore({ ownerId: owner.id, name: "С чеком", slug: "online-receipt", planId: plan.id }))!;
    requests.length = 0;
    const started = await online.startOnlinePayment(store.id, 1, owner.id);
    assert.deepEqual(requests[0].body.receipt, {
      customer: { email: "owner@shop.test" },
      items: [
        {
          description: "Подписка «Витрина + ИИ» на 1 мес. — витрина «С чеком»",
          quantity: 1,
          amount: { value: "990.00", currency: "RUB" },
          vat_code: 1,
          payment_subject: "service",
          payment_mode: "full_payment",
          measure: "piece"
        }
      ],
      tax_system_code: 2
    });
    pay(`yk-${remote.size}`);
    await online.checkOnlinePayment(started.id, store.id);
    assert.equal((await listPayments({ storeId: store.id }))[0].receipt, online.YOOKASSA_RECEIPT);

    // Without an email the receipt goes to the phone, digits only.
    const db = await getDb();
    await db.run("UPDATE users SET email = NULL WHERE id = ?", owner.id);
    requests.length = 0;
    await online.startOnlinePayment(store.id, 1, owner.id);
    assert.deepEqual(requests[0].body.receipt.customer, { phone: "79280000006" });
  } finally {
    delete process.env.YOOKASSA_RECEIPTS;
    delete process.env.YOOKASSA_VAT_CODE;
    delete process.env.YOOKASSA_TAX_SYSTEM;
  }
});

test("ЮKassa не ответила: попытка отменена, владелец видит понятную ошибку", async () => {
  setYookassa(true);
  const store = (await createStore({ ownerId: owner.id, name: "Сбой", slug: "online-down", planId: plan.id }))!;
  const working = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ type: "error", description: "Internal error" }), { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(online.startOnlinePayment(store.id, 1, owner.id), /Не удалось перейти к оплате/);
  } finally {
    globalThis.fetch = working;
  }
  const db = await getDb();
  assert.deepEqual(await db.all("SELECT status FROM online_payments WHERE storeId = ?", store.id), [{ status: "CANCELED" }]);
  await updateStore(store.id, { isActive: 0 });
  await assert.rejects(online.startOnlinePayment(store.id, 1, owner.id), /недоступна/);
});

test.after(async () => {
  globalThis.fetch = realFetch;
  setYookassa(false);
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
