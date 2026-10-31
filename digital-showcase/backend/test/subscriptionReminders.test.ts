import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-reminders-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
delete process.env.YOOKASSA_SHOP_ID;
delete process.env.YOOKASSA_SECRET_KEY;

const { closeDb, initDatabase } = await import("../src/database/db.js");
const { createStore, getStore, updateStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { savePlan } = await import("../src/services/planService.js");
const { listForUser, markRead } = await import("../src/services/notificationService.js");
const { acceptPayment } = await import("../src/services/paymentService.js");
const { dayMonth } = await import("../src/services/subscriptionService.js");
const { reminderStage, sendSubscriptionReminders } = await import("../src/services/subscriptionReminderService.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000031", password: "secret123" }))!;
const plan = await savePlan(null, { name: "Витрина", price: 790, description: "", features: [], aiEnabled: 0, aiMonthlyLimit: null, highlighted: 0, isPublic: 1 });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date(2026, 10, 2, 12, 0); // 2 November, noon
const at = (base: Date, offset: number) => new Date(base.getTime() + offset);

/** The store's notifications in the bell, newest first. */
async function bell(storeId: string) {
  return (await listForUser(owner.id)).items.filter((item) => item.storeId === storeId);
}

test("этапы: за неделю, за день, закончилась, последний день витрины, витрина закрыта", () => {
  const ends = at(now, 10 * DAY);
  assert.equal(reminderStage(ends, at(ends, -8 * DAY).getTime()), null);
  assert.equal(reminderStage(ends, at(ends, -7 * DAY).getTime()), "week");
  assert.equal(reminderStage(ends, at(ends, -2 * DAY).getTime()), "week");
  assert.equal(reminderStage(ends, at(ends, -23 * HOUR).getTime()), "day");
  assert.equal(reminderStage(ends, at(ends, HOUR).getTime()), "ended");
  assert.equal(reminderStage(ends, at(ends, 2 * DAY + HOUR).getTime()), "lastDay");
  assert.equal(reminderStage(ends, at(ends, 3 * DAY + HOUR).getTime()), "closed");
  // Closed long ago: no reminder out of the blue.
  assert.equal(reminderStage(ends, at(ends, 7 * DAY).getTime()), null);
});

test("пробный период: каждое напоминание один раз, непрочитанное заменяется следующим", async () => {
  const ends = at(now, 6 * DAY); // 8 November, noon
  const store = (await createStore({ ownerId: owner.id, name: "Пробный", slug: "reminder-trial", planId: "basic", subscriptionEndsAt: ends.toISOString() }))!;

  await sendSubscriptionReminders(now);
  let [notice] = await bell(store.id);
  assert.equal(notice.title, "Пробный период заканчивается 8 ноября");
  assert.equal(
    notice.body,
    "«Пробный»: осталось 6 дней. Потом ещё 3 дня витрина будет работать без новых товаров, а затем закроется для покупателей. Чтобы продлить, напишите администратору — контакты в «Подписка и оплата»."
  );
  assert.equal(notice.link, `/dashboard/stores/${store.id}/subscription`);
  // Every hour the check runs again: nothing new for the same stage.
  await sendSubscriptionReminders(at(now, HOUR));
  assert.equal((await bell(store.id)).length, 1);

  const steps: [Date, string, RegExp][] = [
    [at(ends, -20 * HOUR), "Пробный период заканчивается завтра", /а 11 ноября витрина закроется/],
    [at(ends, HOUR), "Пробный период закончился", /витрина работает до 11 ноября/],
    [at(ends, 2 * DAY + 6 * HOUR), "Завтра витрина закроется для покупателей", /пробный период закончился 8 ноября/],
    [at(ends, 3 * DAY + HOUR), "Витрина закрыта для покупателей", /Товары сохранены: после продления витрина сразу откроется снова/]
  ];
  for (const [when, title, body] of steps) {
    await sendSubscriptionReminders(when);
    const notices = await bell(store.id);
    // Unread: the newest replaces the one before.
    assert.equal(notices.length, 1);
    [notice] = notices;
    assert.equal(notice.title, title);
    assert.match(notice.body, body);
  }

  // Read — the next paid date's reminder is a new one.
  await markRead(owner.id);
  await acceptPayment(store.id, { amount: 790, months: 1, method: "CASH" }, null);
  const renewed = new Date((await getStore(store.id))!.subscriptionEndsAt!);
  await sendSubscriptionReminders(at(renewed, -3 * DAY));
  const notices = await bell(store.id);
  assert.equal(notices.length, 2);
  // Paid once: it's the subscription now, not the trial.
  assert.equal(notices[0].title, `Подписка заканчивается ${dayMonth.format(renewed)}`);
  assert.equal(notices[0].readAt, null);
});

test("с ЮKassa и ценой у тарифа — продлить онлайн, иначе — через администратора", async () => {
  process.env.YOOKASSA_SHOP_ID = "123456";
  process.env.YOOKASSA_SECRET_KEY = "test_secret";
  try {
    const ends = at(now, 3 * DAY);
    const priced = (await createStore({ ownerId: owner.id, name: "Онлайн", slug: "reminder-online", planId: plan.id, subscriptionEndsAt: ends.toISOString() }))!;
    const byRequest = (await createStore({ ownerId: owner.id, name: "По запросу", slug: "reminder-request", planId: "basic", subscriptionEndsAt: ends.toISOString() }))!;
    await sendSubscriptionReminders(now);
    assert.match((await bell(priced.id))[0].body, /Продлите в «Подписка и оплата» — картой или через СБП, это займёт минуту\.$/);
    // «Цена по запросу»: only the admin extends it.
    assert.match((await bell(byRequest.id))[0].body, /напишите администратору/);
  } finally {
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
  }
});

test("не напоминает: отключённому магазину, без даты окончания, закрытому давно и пока до конца далеко", async () => {
  const soon = at(now, 2 * DAY).toISOString();
  const disabled = (await createStore({ ownerId: owner.id, name: "Отключён", slug: "reminder-disabled", planId: "basic", subscriptionEndsAt: soon }))!;
  await updateStore(disabled.id, { isActive: 0 });
  const unlimited = (await createStore({ ownerId: owner.id, name: "Без даты", slug: "reminder-unlimited", planId: "basic" }))!;
  await updateStore(unlimited.id, { subscriptionEndsAt: null });
  const longAgo = (await createStore({ ownerId: owner.id, name: "Давно", slug: "reminder-long-ago", planId: "basic", subscriptionEndsAt: at(now, -30 * DAY).toISOString() }))!;
  const later = (await createStore({ ownerId: owner.id, name: "Не скоро", slug: "reminder-later", planId: "basic", subscriptionEndsAt: at(now, 20 * DAY).toISOString() }))!;

  await sendSubscriptionReminders(now);
  for (const store of [disabled, unlimited, longAgo, later]) assert.deepEqual(await bell(store.id), [], store.name);
});

test.after(async () => {
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
