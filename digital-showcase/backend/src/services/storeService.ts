import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";

export function isSubscriptionValid(store: Store) {
  return store.isActive === 1 && (!store.subscriptionEndsAt || new Date(store.subscriptionEndsAt).getTime() >= Date.now());
}

export async function listStores() {
  const db = await getDb();
  return db.all<Store & { ownerName: string }>(
    "SELECT stores.*, users.name as ownerName FROM stores JOIN users ON users.id = stores.ownerId ORDER BY stores.createdAt DESC"
  );
}

export async function getStore(id: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE id = ?", id);
}

export async function getOwnerStore(ownerId: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE ownerId = ? ORDER BY createdAt LIMIT 1", ownerId);
}

export async function getStoreBySlug(slug: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE slug = ?", slug);
}

export async function createStore(input: Partial<Store> & { ownerId: string; name: string; slug: string }) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO stores (id, ownerId, name, slug, description, address, phone, whatsapp, telegram, logoUrl, coverUrl, isActive, aiFormEnabled, subscriptionEndsAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.ownerId,
    input.name,
    input.slug,
    input.description ?? null,
    input.address ?? null,
    input.phone ?? null,
    input.whatsapp ?? null,
    input.telegram ?? null,
    input.logoUrl ?? null,
    input.coverUrl ?? null,
    input.isActive ?? 1,
    input.aiFormEnabled ?? 0,
    input.subscriptionEndsAt ?? null,
    now,
    now
  );
  return getStore(id);
}

export async function updateStore(id: string, input: Partial<Store>) {
  const current = await getStore(id);
  if (!current) return null;
  const db = await getDb();
  await db.run(
    `UPDATE stores SET ownerId = ?, name = ?, slug = ?, description = ?, address = ?, phone = ?, whatsapp = ?, telegram = ?,
     logoUrl = ?, coverUrl = ?, isActive = ?, aiFormEnabled = ?, subscriptionEndsAt = ?, updatedAt = ? WHERE id = ?`,
    input.ownerId ?? current.ownerId,
    input.name ?? current.name,
    input.slug ?? current.slug,
    input.description ?? current.description,
    input.address ?? current.address,
    input.phone ?? current.phone,
    input.whatsapp ?? current.whatsapp,
    input.telegram ?? current.telegram,
    input.logoUrl ?? current.logoUrl,
    input.coverUrl ?? current.coverUrl,
    input.isActive ?? current.isActive,
    input.aiFormEnabled ?? current.aiFormEnabled,
    input.subscriptionEndsAt ?? current.subscriptionEndsAt,
    new Date().toISOString(),
    id
  );
  return getStore(id);
}

export async function deleteStore(id: string) {
  const db = await getDb();
  await db.run("DELETE FROM stores WHERE id = ?", id);
}

export async function extendSubscription(id: string, days: number) {
  const store = await getStore(id);
  if (!store) return null;
  const base = store.subscriptionEndsAt && new Date(store.subscriptionEndsAt).getTime() > Date.now() ? new Date(store.subscriptionEndsAt) : new Date();
  base.setDate(base.getDate() + days);
  return updateStore(id, { subscriptionEndsAt: base.toISOString(), isActive: 1 });
}
