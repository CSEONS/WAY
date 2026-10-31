import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { notifyUser } from "./notificationService.js";
import { onlineOffer } from "./onlinePaymentService.js";
import { dayMonth, GRACE_DAYS, subscriptionTopic, trialLabel, WARNING_DAYS } from "./subscriptionService.js";

// Reminders to pay, in the owner's bell: a week and a day before the paid
// date, when it has passed (the storefront works GRACE_DAYS more, without new
// products), on the day the storefront closes and right after it has. Each is
// sent once per paid date — stores.subscriptionReminder remembers the last
// one — and an unread one is replaced by the next, so the bell shows only the
// latest. A new paid date starts them over. Checked every hour, like the month
// results: a server that was off sends the one due now, not the missed ones.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** «Витрина закрыта» goes this long after closing; stores closed before that aren't reminded out of the blue. */
const CLOSED_REMINDER_DAYS = 3;

export type ReminderStage = "week" | "day" | "ended" | "lastDay" | "closed";

/** The reminder due for a paid date at `now`, or null: not soon yet, or closed long ago. */
export function reminderStage(endsAt: Date, now: number): ReminderStage | null {
  const ends = endsAt.getTime();
  const closes = ends + GRACE_DAYS * DAY_MS;
  if (now < ends - WARNING_DAYS * DAY_MS) return null;
  if (now < ends - DAY_MS) return "week";
  if (now < ends) return "day";
  if (now < closes - DAY_MS) return "ended";
  if (now < closes) return "lastDay";
  if (now < closes + CLOSED_REMINDER_DAYS * DAY_MS) return "closed";
  return null;
}

/** «сегодня», «завтра», otherwise «12 ноября» — by the server's calendar (TZ). */
function relativeDay(date: Date, now: Date) {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((start(date) - start(now)) / DAY_MS);
  return diff <= 0 ? "сегодня" : diff === 1 ? "завтра" : dayMonth.format(date);
}

const days = (count: number) => trialLabel({ count, unit: "days" });

export interface ReminderFacts {
  storeName: string;
  endsAt: Date;
  /** Nothing paid for the plan yet: it's the free period ending. */
  isTrial: boolean;
  /** The owner can pay in «Подписка и оплата» (ЮKassa); otherwise through the admin. */
  payOnline: boolean;
}

/** The notification: what happens when, and how to renew. */
export function reminderText(stage: ReminderStage, facts: ReminderFacts, now: Date) {
  const { storeName, endsAt, isTrial, payOnline } = facts;
  const closes = new Date(endsAt.getTime() + GRACE_DAYS * DAY_MS);
  const subject = isTrial ? "Пробный период" : "Подписка";
  const ended = isTrial ? "Пробный период закончился" : "Подписка закончилась";
  const how = payOnline
    ? "Продлите в «Подписка и оплата» — картой или через СБП, это займёт минуту."
    : "Чтобы продлить, напишите администратору — контакты в «Подписка и оплата».";
  const store = `«${storeName}»:`;
  switch (stage) {
    case "week":
      return {
        title: `${subject} заканчивается ${dayMonth.format(endsAt)}`,
        body: `${store} осталось ${days(Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS))}. Потом ещё ${days(GRACE_DAYS)} витрина будет работать без новых товаров, а затем закроется для покупателей. ${how}`
      };
    case "day":
      return {
        title: `${subject} заканчивается ${relativeDay(endsAt, now)}`,
        body: `${store} после этого новые товары добавить будет нельзя, а ${dayMonth.format(closes)} витрина закроется для покупателей. ${how}`
      };
    case "ended":
      return {
        title: ended,
        body: `${store} витрина работает до ${dayMonth.format(closes)}, потом покупатели увидят «Магазин недоступен». Новые товары можно добавлять после продления. ${how}`
      };
    case "lastDay": {
      const when = relativeDay(closes, now);
      return {
        title: `${when[0].toUpperCase()}${when.slice(1)} витрина закроется для покупателей`,
        body: `${store} ${ended.toLowerCase()} ${dayMonth.format(endsAt)}. Продлите, чтобы покупатели не увидели «Магазин недоступен». ${how}`
      };
    }
    case "closed":
      return {
        title: "Витрина закрыта для покупателей",
        body: `${store} ${ended.toLowerCase()} ${dayMonth.format(endsAt)}. Товары сохранены: после продления витрина сразу откроется снова. ${how}`
      };
  }
}

type ReminderRow = Pick<Store, "id" | "name" | "ownerId" | "planId" | "isActive" | "subscriptionEndsAt" | "subscriptionReminder"> & { paid: number };

/** Sends the reminders due now to the owners of switched-on stores with a paid date. Returns how many were sent. */
export async function sendSubscriptionReminders(now = new Date()) {
  const db = await getDb();
  const stores = await db.all<ReminderRow>(
    `SELECT s.id, s.name, s.ownerId, s.planId, s.isActive, s.subscriptionEndsAt, s.subscriptionReminder,
       EXISTS (SELECT 1 FROM payments p WHERE p.storeId = s.id AND p.packageName IS NULL) as paid
     FROM stores s WHERE s.isActive = 1 AND s.subscriptionEndsAt IS NOT NULL`
  );
  let sent = 0;
  for (const store of stores) {
    const endsAt = new Date(store.subscriptionEndsAt!);
    if (Number.isNaN(endsAt.getTime())) continue;
    const stage = reminderStage(endsAt, now.getTime());
    if (!stage) continue;
    const key = `${store.subscriptionEndsAt}|${stage}`;
    if (store.subscriptionReminder === key) continue;

    const { title, body } = reminderText(stage, { storeName: store.name, endsAt, isTrial: !store.paid, payOnline: Boolean(onlineOffer(store)) }, now);
    await notifyUser({
      userId: store.ownerId,
      storeId: store.id,
      source: "SYSTEM",
      title,
      body,
      link: `/dashboard/stores/${store.id}/subscription`,
      topic: subscriptionTopic(store.id)
    });
    await db.run("UPDATE stores SET subscriptionReminder = ? WHERE id = ?", key, store.id);
    sent += 1;
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

/** Checks every hour (and a minute after start) whose paid date is near or has passed. */
export function startSubscriptionReminders() {
  if (timer) return;
  const run = () =>
    sendSubscriptionReminders()
      .then((count) => count && console.log(`Payment reminders sent: ${count}`))
      .catch((error) => console.error("Payment reminders failed", error));
  setTimeout(run, 60 * 1000).unref();
  timer = setInterval(run, HOUR_MS);
  timer.unref();
}
