import { getDb } from "../database/db.js";
import { notifyUser } from "./notificationService.js";
import { monthKey } from "./paymentService.js";
import { type MonthReport, monthRange, storeMonthReport } from "./reportService.js";

// Month results reach every owner as a notification when the month is over:
// «Итоги за сентябрь». Only owners on the full plan (plans.reportsAnytime) can
// also open them in the app on any day. The check runs every hour and sends
// each store's month once, so a server that was off catches up when it starts.

const HOUR_MS = 60 * 60 * 1000;
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const CHANNELS: [keyof MonthReport["contactsByChannel"], string][] = [
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["instagram", "Instagram"],
  ["vk", "ВКонтакте"],
  ["phone", "звонок"]
];

function plural(count: number, [one, few, many]: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const times = (count: number) => `${count.toLocaleString("ru-RU")} ${plural(count, ["раз", "раза", "раз"])}`;

/** «сентябрь 2026» for "2026-09". */
export function monthTitle(month: string) {
  const [year, index] = month.split("-").map(Number);
  return `${MONTHS[index - 1]} ${year}`;
}

/** The notification's text: plain lines the bell shows as they are. */
export function reportText(storeName: string, report: MonthReport) {
  const channels = CHANNELS.filter(([key]) => report.contactsByChannel[key] > 0).map(([key, label]) => `${label} — ${report.contactsByChannel[key]}`);
  const lines = [
    `«${storeName}», итоги за ${monthTitle(report.month)}.`,
    `Витрину открыли: ${times(report.storeViews)}.`,
    `Товары посмотрели: ${times(report.productViews)}.`,
    `Написали или позвонили: ${times(report.contactClicks)}${channels.length ? ` (${channels.join(", ")})` : ""}.`,
    `Новых товаров: ${report.newProducts}.`
  ];
  if (report.topProducts.length) lines.push(`Чаще всего смотрели: ${report.topProducts.map((product) => `${product.title} (${product.views})`).join(", ")}.`);
  if (!report.storeViews) lines.push("Витрину не открывали. Отправьте ссылку в статус WhatsApp и повесьте QR-плакат на кассе.");
  return lines.join("\n");
}

/**
 * Sends last month's results to the owner of every store that was in service
 * that month: switched on, existing before the month ended, and paid at least
 * into the month (or without an end date). One notification per store and month.
 * Returns how many were sent.
 */
export async function sendMonthlyReports(now = new Date()) {
  const month = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const { from, to } = monthRange(month);
  const db = await getDb();
  const stores = await db.all<{ id: string; name: string; ownerId: string; subscriptionEndsAt: string | null; reportsAnytime: number | null }>(
    `SELECT s.id, s.name, s.ownerId, s.subscriptionEndsAt, p.reportsAnytime FROM stores s LEFT JOIN plans p ON p.id = s.planId
     WHERE s.isActive = 1 AND s.createdAt < ? AND (s.subscriptionEndsAt IS NULL OR s.subscriptionEndsAt >= ?)`,
    to,
    from
  );
  let sent = 0;
  for (const store of stores) {
    const topic = `report:${store.id}:${month}`;
    const already = await db.get("SELECT 1 FROM notifications WHERE userId = ? AND topic = ?", store.ownerId, topic);
    if (already) continue;
    const report = await storeMonthReport(store.id, month);
    await notifyUser({
      userId: store.ownerId,
      storeId: store.id,
      source: "SYSTEM",
      title: `Итоги за ${monthTitle(month)}`,
      body: reportText(store.name, report),
      // On the full plan the results are in the app too.
      link: store.reportsAnytime ? `/dashboard/stores/${store.id}/subscription` : null,
      topic
    });
    sent += 1;
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

/** Checks every hour (and a minute after start) whether a month has ended. */
export function startMonthlyReports() {
  if (timer) return;
  const run = () =>
    sendMonthlyReports()
      .then((count) => count && console.log(`Month results sent to ${count} owners`))
      .catch((error) => console.error("Month results failed", error));
  setTimeout(run, 60 * 1000).unref();
  timer = setInterval(run, HOUR_MS);
  timer.unref();
}
