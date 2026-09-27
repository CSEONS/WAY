import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { monthKey } from "./paymentService.js";

export interface MonthReport {
  /** "YYYY-MM". */
  month: string;
  storeViews: number;
  productViews: number;
  contactClicks: number;
  contactsByChannel: { whatsapp: number; telegram: number; phone: number };
  newProducts: number;
  /** Most viewed products of the month. */
  topProducts: { id: string; title: string; views: number }[];
}

/** Start and end (exclusive) of a "YYYY-MM" month in the server's time zone. */
export function monthRange(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new HttpError(400, "Месяц в формате ГГГГ-ММ");
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new HttpError(400, "Месяц в формате ГГГГ-ММ");
  return { from: new Date(year, monthIndex, 1).toISOString(), to: new Date(year, monthIndex + 1, 1).toISOString() };
}

/** The last `count` months, newest first: ["2026-09", "2026-08", …]. */
export function recentMonths(count: number, now = new Date()) {
  return Array.from({ length: count }, (_, index) => monthKey(new Date(now.getFullYear(), now.getMonth() - index, 1)));
}

/** «Витрину посмотрели 340 раз, 25 человек написали» — one store, one month. */
export async function storeMonthReport(storeId: string, month: string): Promise<MonthReport> {
  const { from, to } = monthRange(month);
  const db = await getDb();
  const [events, channels, newProducts, topProducts] = await Promise.all([
    db.all<{ type: string; count: number }>(
      "SELECT type, COUNT(*) as count FROM analytics_events WHERE storeId = ? AND createdAt >= ? AND createdAt < ? GROUP BY type",
      storeId,
      from,
      to
    ),
    db.all<{ channel: string; count: number }>(
      "SELECT channel, COUNT(*) as count FROM analytics_events WHERE storeId = ? AND type = 'CONTACT_CLICK' AND createdAt >= ? AND createdAt < ? GROUP BY channel",
      storeId,
      from,
      to
    ),
    db.get<{ count: number }>("SELECT COUNT(*) as count FROM products WHERE storeId = ? AND createdAt >= ? AND createdAt < ?", storeId, from, to),
    db.all<{ id: string; title: string; views: number }>(
      `SELECT p.id, p.title, COUNT(*) as views FROM analytics_events e JOIN products p ON p.id = e.productId
       WHERE e.storeId = ? AND e.type = 'PRODUCT_VIEW' AND e.createdAt >= ? AND e.createdAt < ?
       GROUP BY p.id, p.title ORDER BY views DESC LIMIT 3`,
      storeId,
      from,
      to
    )
  ]);
  const count = (type: string) => events.find((row) => row.type === type)?.count ?? 0;
  const channel = (name: string) => channels.find((row) => row.channel === name)?.count ?? 0;
  return {
    month,
    storeViews: count("STORE_VIEW"),
    productViews: count("PRODUCT_VIEW"),
    contactClicks: count("CONTACT_CLICK"),
    contactsByChannel: { whatsapp: channel("whatsapp"), telegram: channel("telegram"), phone: channel("phone") },
    newProducts: newProducts?.count ?? 0,
    topProducts
  };
}
