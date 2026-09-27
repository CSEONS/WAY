import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "../utils/slug.js";
import { deleteStoredImage, storeProductImage, type UploadedImage } from "./imageService.js";
import { addDays, isStorefrontOpen, trialDays } from "./subscriptionService.js";

/** Buyers can open the storefront (paid, or within the grace days after the paid date). */
export function isSubscriptionValid(store: Store) {
  return isStorefrontOpen(store);
}

/** Clean, free store address or a clear 400 — instead of a 500 from the UNIQUE constraint. */
export async function assertSlugAvailable(slug: string, exceptStoreId?: string) {
  if (!SLUG_PATTERN.test(slug) || slug.length > SLUG_MAX_LENGTH) {
    throw new HttpError(400, "Адрес витрины: только латинские буквы, цифры и дефис, до 40 символов");
  }
  const existing = await getStoreBySlug(slug);
  if (existing && existing.id !== exceptStoreId) throw new HttpError(400, `Адрес /m/${slug} уже занят магазином «${existing.name}»`);
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

export async function getOwnerStoreById(ownerId: string, storeId: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE id = ? AND ownerId = ?", storeId, ownerId);
}

export async function getStoreBySlug(slug: string) {
  const db = await getDb();
  return db.get<Store>("SELECT * FROM stores WHERE slug = ?", slug);
}

/** A store without a paid date gets the trial period, so nobody runs for free forever by accident. */
export async function createStore(input: Partial<Store> & { ownerId: string; name: string; slug: string }) {
  const slug = input.slug.trim().toLowerCase();
  await assertSlugAvailable(slug);
  const db = await getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO stores (id, ownerId, name, slug, description, address, phone, whatsapp, telegram, logoUrl, workingHours, isActive, aiFormEnabled, subscriptionEndsAt, aiMonthlyLimit, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.ownerId,
    input.name,
    slug,
    input.description ?? null,
    input.address ?? null,
    input.phone ?? null,
    input.whatsapp ?? null,
    input.telegram ?? null,
    input.logoUrl ?? null,
    input.workingHours ?? null,
    input.isActive ?? 1,
    input.aiFormEnabled ?? 0,
    input.subscriptionEndsAt || addDays(new Date(), trialDays()).toISOString(),
    input.aiMonthlyLimit ?? null,
    now,
    now
  );
  return getStore(id);
}

export async function updateStore(id: string, input: Partial<Store>) {
  const current = await getStore(id);
  if (!current) return null;
  const slug = input.slug?.trim().toLowerCase() || current.slug;
  if (slug !== current.slug) await assertSlugAvailable(slug, id);
  const db = await getDb();
  await db.run(
    `UPDATE stores SET ownerId = ?, name = ?, slug = ?, description = ?, address = ?, phone = ?, whatsapp = ?, telegram = ?,
     logoUrl = ?, workingHours = ?, isActive = ?, aiFormEnabled = ?, subscriptionEndsAt = ?, aiMonthlyLimit = ?, updatedAt = ? WHERE id = ?`,
    input.ownerId ?? current.ownerId,
    input.name ?? current.name,
    slug,
    field(input, "description", current.description),
    field(input, "address", current.address),
    field(input, "phone", current.phone),
    field(input, "whatsapp", current.whatsapp),
    field(input, "telegram", current.telegram),
    field(input, "logoUrl", current.logoUrl),
    field(input, "workingHours", current.workingHours),
    input.isActive ?? current.isActive,
    input.aiFormEnabled ?? current.aiFormEnabled,
    field(input, "subscriptionEndsAt", current.subscriptionEndsAt),
    field(input, "aiMonthlyLimit", current.aiMonthlyLimit),
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

export async function updateStoreLogo(id: string, file: UploadedImage) {
  const store = await getStore(id);
  if (!store) return null;
  const logoUrl = await storeProductImage(file);
  const updated = await updateStore(id, { logoUrl });
  await deleteStoredImage(store.logoUrl);
  return updated;
}
