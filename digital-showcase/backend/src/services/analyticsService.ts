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
  return {
    storeViews: storeViews?.count ?? 0,
    productViews: productViews?.count ?? 0
  };
}
