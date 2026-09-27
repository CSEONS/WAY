import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { estimateCost, monthlyLimit, monthStart, usageByStore } from "./aiUsageService.js";
import { revenueByMonth } from "./paymentService.js";
import { subscriptionInfo } from "./subscriptionService.js";

/** An owner who hasn't opened the app for this long is worth a call. */
export const INACTIVE_DAYS = 14;
/** A just-connected owner gets a few days to sign in before they count as inactive. */
const NEW_OWNER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type StoreWithOwner = Store & { ownerName: string; ownerPhone: string | null; ownerLastSeenAt: string | null };

/** Everything the admin panel's first screen needs, in one request. */
export async function adminOverview(now = new Date()) {
  const db = await getDb();
  const [stores, products, aiUsage, contacts, revenue, newLeads] = await Promise.all([
    db.all<StoreWithOwner>(
      "SELECT s.*, u.name as ownerName, u.phone as ownerPhone, u.lastSeenAt as ownerLastSeenAt FROM stores s JOIN users u ON u.id = s.ownerId"
    ),
    db.all<{ storeId: string; total: number; visible: number }>("SELECT storeId, COUNT(*) as total, SUM(isVisible) as visible FROM products GROUP BY storeId"),
    usageByStore(now),
    db.all<{ storeId: string; count: number }>(
      "SELECT storeId, COUNT(*) as count FROM analytics_events WHERE type = 'CONTACT_CLICK' AND createdAt >= ? GROUP BY storeId",
      monthStart(now)
    ),
    revenueByMonth(6, now),
    db.get<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'")
  ]);

  const inactiveSince = now.getTime() - INACTIVE_DAYS * DAY_MS;
  const rows = stores
    .map((store) => {
      const productRow = products.find((row) => row.storeId === store.id);
      const usage = aiUsage.find((row) => row.storeId === store.id);
      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        ownerId: store.ownerId,
        ownerName: store.ownerName,
        ownerPhone: store.ownerPhone,
        ownerLastSeenAt: store.ownerLastSeenAt,
        createdAt: store.createdAt,
        isActive: store.isActive,
        aiFormEnabled: store.aiFormEnabled,
        subscriptionEndsAt: store.subscriptionEndsAt,
        subscription: subscriptionInfo(store, now.getTime()),
        productCount: productRow?.total ?? 0,
        visibleProductCount: productRow?.visible ?? 0,
        ai: { used: usage?.units ?? 0, limit: monthlyLimit(store) },
        contactsThisMonth: contacts.find((row) => row.storeId === store.id)?.count ?? 0
      };
    })
    // Most urgent first: the earliest paid date; stores without a date last.
    .sort((a, b) => (a.subscriptionEndsAt ?? "9999").localeCompare(b.subscriptionEndsAt ?? "9999"));

  const tokens = aiUsage.reduce(
    (sum, row) => ({ inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens }),
    { inputTokens: 0, outputTokens: 0 }
  );

  return {
    stores: rows,
    expiring: rows.filter((row) => row.subscription.state === "expiring"),
    overdue: rows.filter((row) => row.subscription.state === "grace" || row.subscription.state === "expired"),
    inactive: inactiveOwners(rows, inactiveSince, now.getTime() - NEW_OWNER_DAYS * DAY_MS),
    revenue: { byMonth: revenue, thisMonth: revenue[revenue.length - 1]?.total ?? 0 },
    ai: { cards: aiUsage.reduce((sum, row) => sum + row.units, 0), ...tokens, costRub: estimateCost(tokens) },
    newLeads: newLeads?.count ?? 0,
    inactiveDays: INACTIVE_DAYS
  };
}

type OverviewRow = { ownerId: string; name: string; isActive: number; ownerLastSeenAt: string | null; createdAt: string };

/** One row per owner (their store names joined), not one per store. */
function inactiveOwners<T extends OverviewRow>(rows: T[], inactiveSince: number, newSince: number) {
  const byOwner = new Map<string, T>();
  for (const row of rows) {
    if (!row.isActive) continue;
    const isInactive = row.ownerLastSeenAt ? Date.parse(row.ownerLastSeenAt) < inactiveSince : Date.parse(row.createdAt) < newSince;
    if (!isInactive) continue;
    const seen = byOwner.get(row.ownerId);
    byOwner.set(row.ownerId, seen ? { ...seen, name: `${seen.name}, ${row.name}` } : row);
  }
  return [...byOwner.values()];
}
