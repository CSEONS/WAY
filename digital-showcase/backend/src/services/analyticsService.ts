import { getDb } from "../database/db.js";

export async function recordStoreView(storeId: string) {
  const db = await getDb();
  await db.run(
    "INSERT INTO analytics_events (id, storeId, productId, type, createdAt) VALUES (?, ?, NULL, 'STORE_VIEW', ?)",
    crypto.randomUUID(),
    storeId,
    new Date().toISOString()
  );
}

export async function recordProductView(storeId: string, productId: string) {
  const db = await getDb();
  await db.run(
    "INSERT INTO analytics_events (id, storeId, productId, type, createdAt) VALUES (?, ?, ?, 'PRODUCT_VIEW', ?)",
    crypto.randomUUID(),
    storeId,
    productId,
    new Date().toISOString()
  );
}

export type ContactChannel = "whatsapp" | "telegram" | "phone";

/** A buyer tapped «Написать в WhatsApp», Telegram or «Позвонить» — the number owners care about most. */
export async function recordContactClick(storeId: string, productId: string | null, channel: ContactChannel) {
  const db = await getDb();
  await db.run(
    "INSERT INTO analytics_events (id, storeId, productId, type, channel, createdAt) VALUES (?, ?, ?, 'CONTACT_CLICK', ?, ?)",
    crypto.randomUUID(),
    storeId,
    productId,
    channel,
    new Date().toISOString()
  );
}

export async function getStoreAnalytics(storeId: string) {
  const db = await getDb();
  const storeViews = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM analytics_events WHERE storeId = ? AND type = 'STORE_VIEW'",
    storeId
  );
  const productViews = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM analytics_events WHERE storeId = ? AND type = 'PRODUCT_VIEW'",
    storeId
  );
  const contactClicks = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM analytics_events WHERE storeId = ? AND type = 'CONTACT_CLICK'",
    storeId
  );
  return {
    storeViews: storeViews?.count ?? 0,
    productViews: productViews?.count ?? 0,
    contactClicks: contactClicks?.count ?? 0
  };
}
