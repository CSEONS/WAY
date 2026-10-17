import { getDb } from "../database/db.js";
import type { Lead, Store } from "../types/models.js";
import { aiSettings, previewSettings } from "./aiProvider.js";
import { monthlyLimit, monthSpend, monthStart, usageByStore } from "./aiUsageService.js";
import { backupSettings, lastSuccessfulBackup, listBackupRuns } from "./backupService.js";
import { countPending } from "./imageModerationService.js";
import { revenueByMonth } from "./paymentService.js";
import { subscriptionInfo } from "./subscriptionService.js";

/** An owner who hasn't opened the app for this long is worth a call. */
export const INACTIVE_DAYS = 14;
/** A just-connected owner gets a few days to sign in before they count as inactive. */
const NEW_OWNER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The nightly copy plus a couple of hours of slack. */
const BACKUP_STALE_MS = 26 * 60 * 60 * 1000;
/** New requests from the landing shown at the top of the admin panel. */
const LATEST_LEADS = 5;

type StoreWithOwner = Store & { ownerName: string; ownerPhone: string | null; ownerLastSeenAt: string | null };

/** Everything the admin panel's first screen needs, in one request. */
export async function adminOverview(now = new Date()) {
  const db = await getDb();
  const [stores, products, aiUsage, aiSpend, contacts, revenue, newLeads, latestLeads, backup, moderationPending] = await Promise.all([
    db.all<StoreWithOwner>(
      "SELECT s.*, u.name as ownerName, u.phone as ownerPhone, u.lastSeenAt as ownerLastSeenAt FROM stores s JOIN users u ON u.id = s.ownerId"
    ),
    db.all<{ storeId: string; total: number; visible: number }>("SELECT storeId, COUNT(*) as total, SUM(isVisible) as visible FROM products GROUP BY storeId"),
    usageByStore(now),
    monthSpend({ text: aiSettings().model, preview: previewSettings()?.model ?? null }, now),
    db.all<{ storeId: string; count: number }>(
      "SELECT storeId, COUNT(*) as count FROM analytics_events WHERE type = 'CONTACT_CLICK' AND createdAt >= ? GROUP BY storeId",
      monthStart(now)
    ),
    revenueByMonth(6, now),
    db.get<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE status = 'NEW'"),
    db.all<Lead>("SELECT * FROM leads WHERE status = 'NEW' ORDER BY createdAt DESC LIMIT ?", LATEST_LEADS),
    backupProblem(now),
    countPending()
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

  return {
    stores: rows,
    expiring: rows.filter((row) => row.subscription.state === "expiring"),
    overdue: rows.filter((row) => row.subscription.state === "grace" || row.subscription.state === "expired"),
    inactive: inactiveOwners(rows, inactiveSince, now.getTime() - NEW_OWNER_DAYS * DAY_MS),
    revenue: { byMonth: revenue, thisMonth: revenue[revenue.length - 1]?.total ?? 0 },
    ai: { cards: aiUsage.reduce((sum, row) => sum + row.units, 0), ...aiSpend },
    newLeads: newLeads?.count ?? 0,
    latestLeads,
    backupProblem: backup,
    /** Photos with living beings waiting for moderation: hidden from buyers until then. */
    moderationPending,
    inactiveDays: INACTIVE_DAYS
  };
}

/**
 * A copy that failed, or none for over a day: the data are at risk, so it
 * goes to the top of the admin panel. Null while a copy is running or all is well.
 */
async function backupProblem(now: Date) {
  const [latest] = await listBackupRuns(1);
  if (latest?.status === "FAILED") return { kind: "failed" as const, at: latest.startedAt, error: latest.error };
  if (latest?.status === "RUNNING" || !backupSettings().enabled) return null;
  const lastOk = await lastSuccessfulBackup();
  const at = lastOk ? (lastOk.finishedAt ?? lastOk.startedAt) : null;
  if (at && now.getTime() - Date.parse(at) <= BACKUP_STALE_MS) return null;
  return { kind: "stale" as const, at, error: null };
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
