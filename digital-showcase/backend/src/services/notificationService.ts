import { getDb } from "../database/db.js";

// The bell in the owner's app. Notifications come from the system (a photo
// with a face, the admin's decision about it) or from the admin («Уведомления»
// in the admin panel). Each belongs to one user; a broadcast to all owners is
// one row per owner sharing a batchId.

export type NotificationSource = "SYSTEM" | "ADMIN";

export interface Notification {
  id: string;
  storeId: string | null;
  source: NotificationSource;
  title: string;
  body: string;
  /** In-app address to open, e.g. the product's edit page. */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotifyInput {
  userId: string;
  storeId?: string | null;
  source: NotificationSource;
  title: string;
  body: string;
  link?: string | null;
  /**
   * What the notification is about, e.g. "moderation:<productId>". An unread
   * one on the same topic is replaced, so several photos of one product or a
   * warning followed by the admin's decision don't pile up.
   */
  topic?: string | null;
  batchId?: string | null;
}

export async function notifyUser(input: NotifyInput) {
  const db = await getDb();
  const now = new Date().toISOString();
  if (input.topic) {
    const unread = await db.get<{ id: string }>("SELECT id FROM notifications WHERE userId = ? AND topic = ? AND readAt IS NULL", input.userId, input.topic);
    if (unread) {
      await db.run(
        "UPDATE notifications SET source = ?, title = ?, body = ?, link = ?, storeId = ?, createdAt = ? WHERE id = ?",
        input.source,
        input.title,
        input.body,
        input.link ?? null,
        input.storeId ?? null,
        now,
        unread.id
      );
      return;
    }
  }
  await db.run(
    "INSERT INTO notifications (id, userId, storeId, source, title, body, link, topic, batchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    input.userId,
    input.storeId ?? null,
    input.source,
    input.title,
    input.body,
    input.link ?? null,
    input.topic ?? null,
    input.batchId ?? null,
    now
  );
}

/** To the owner of the store. Nothing happens if the store is gone. */
export async function notifyStoreOwner(storeId: string, input: Omit<NotifyInput, "userId" | "storeId">) {
  const db = await getDb();
  const store = await db.get<{ ownerId: string }>("SELECT ownerId FROM stores WHERE id = ?", storeId);
  if (!store) return;
  await notifyUser({ ...input, userId: store.ownerId, storeId });
}

/** The bell: the newest first and how many are unread. */
export async function listForUser(userId: string, limit = 50) {
  const db = await getDb();
  const [items, unread] = await Promise.all([
    db.all<Notification>(
      "SELECT id, storeId, source, title, body, link, createdAt, readAt FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT ?",
      userId,
      limit
    ),
    db.get<{ count: number }>("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND readAt IS NULL", userId)
  ]);
  return { items, unread: unread?.count ?? 0 };
}

/** Marks the user's notifications read: the given ones, or all of them. */
export async function markRead(userId: string, ids?: string[]) {
  const db = await getDb();
  const now = new Date().toISOString();
  if (ids?.length) {
    await db.run(`UPDATE notifications SET readAt = ? WHERE userId = ? AND readAt IS NULL AND id IN (${ids.map(() => "?").join(", ")})`, now, userId, ...ids);
  } else {
    await db.run("UPDATE notifications SET readAt = ? WHERE userId = ? AND readAt IS NULL", now, userId);
  }
}

/** From the admin panel: to the owner of one store, or to every owner (storeId null). Returns how many got it. */
export async function sendFromAdmin({ storeId, title, body }: { storeId: string | null; title: string; body: string }) {
  const db = await getDb();
  const recipients = storeId
    ? await db.all<{ userId: string; storeId: string | null }>("SELECT ownerId as userId, id as storeId FROM stores WHERE id = ?", storeId)
    : await db.all<{ userId: string; storeId: string | null }>("SELECT id as userId, NULL as storeId FROM users WHERE role = 'OWNER'");
  const batchId = crypto.randomUUID();
  for (const recipient of recipients) {
    await notifyUser({ userId: recipient.userId, storeId: recipient.storeId, source: "ADMIN", title, body, batchId });
  }
  return { sent: recipients.length, batchId };
}

/** What the admin sent lately: one row per sending, with how many owners got and read it. */
export async function adminHistory(limit = 30) {
  const db = await getDb();
  return db.all<{ batchId: string; title: string; body: string; createdAt: string; recipients: number; read: number; storeName: string | null }>(
    `SELECT n.batchId, MAX(n.title) as title, MAX(n.body) as body, MIN(n.createdAt) as createdAt, COUNT(*) as recipients,
            SUM(CASE WHEN n.readAt IS NULL THEN 0 ELSE 1 END) as read,
            CASE WHEN COUNT(*) = 1 THEN MAX(s.name) ELSE NULL END as storeName
     FROM notifications n LEFT JOIN stores s ON s.id = n.storeId
     WHERE n.source = 'ADMIN' AND n.batchId IS NOT NULL
     GROUP BY n.batchId ORDER BY createdAt DESC LIMIT ?`,
    limit
  );
}
