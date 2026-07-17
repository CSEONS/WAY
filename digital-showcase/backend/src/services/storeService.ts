import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { deleteStoredImage, storeProductImage, type UploadedImage } from "./imageService.js";

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

export async function listOwnerStores(ownerId: string) {
  const db = await getDb();
  return db.all<Store>("SELECT * FROM stores WHERE ownerId = ? ORDER BY createdAt DESC", ownerId);
}

export async function getOwnerStore(ownerId: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE ownerId = ? ORDER BY createdAt LIMIT 1", ownerId);
}

export async function getOwnerStoreById(ownerId: string, storeId: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE id = ? AND ownerId = ?", storeId, ownerId);
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
    `INSERT INTO stores (id, ownerId, name, slug, description, address, phone, whatsapp, telegram, logoUrl, isActive, aiFormEnabled, subscriptionEndsAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
     logoUrl = ?, isActive = ?, aiFormEnabled = ?, subscriptionEndsAt = ?, updatedAt = ? WHERE id = ?`,
    input.ownerId ?? current.ownerId,
    input.name ?? current.name,
    input.slug ?? current.slug,
    field(input, "description", current.description),
    field(input, "address", current.address),
    field(input, "phone", current.phone),
    field(input, "whatsapp", current.whatsapp),
    field(input, "telegram", current.telegram),
    field(input, "logoUrl", current.logoUrl),
    input.isActive ?? current.isActive,
    input.aiFormEnabled ?? current.aiFormEnabled,
    field(input, "subscriptionEndsAt", current.subscriptionEndsAt),
    new Date().toISOString(),
    id
  );
  return getStore(id);
}

function field<K extends keyof Store>(input: Partial<Store>, key: K, fallback: Store[K]) {
  return Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined ? input[key] : fallback;
}

export async function deleteStore(id: string) {
  const db = await getDb();
  const store = await getStore(id);
  const images = await db.all<{ url: string }>("SELECT product_images.url FROM product_images JOIN products ON products.id = product_images.productId WHERE products.storeId = ?", id);
  await db.run("DELETE FROM stores WHERE id = ?", id);
  await Promise.all([deleteStoredImage(store?.logoUrl), ...images.map((image) => deleteStoredImage(image.url))]);
}

export async function extendSubscription(id: string, days: number) {
  const store = await getStore(id);
  if (!store) return null;
  const base = store.subscriptionEndsAt && new Date(store.subscriptionEndsAt).getTime() > Date.now() ? new Date(store.subscriptionEndsAt) : new Date();
  base.setDate(base.getDate() + days);
  return updateStore(id, { subscriptionEndsAt: base.toISOString(), isActive: 1 });
}

export async function updateStoreLogo(id: string, file: UploadedImage) {
  const store = await getStore(id);
  if (!store) return null;
  const logoUrl = await storeProductImage(file);
  const updated = await updateStore(id, { logoUrl });
  await deleteStoredImage(store.logoUrl);
  return updated;
}
