import { getDb } from "../database/db.js";
import type { Product, ProductColor, ProductFull, ProductImage, ProductSize, ProductVariant } from "../types/models.js";

type ProductVariantInput = {
  colorName?: string;
  colorHex?: string | null;
  size?: string;
  price?: number | string | null;
};

async function enrich(product: Product): Promise<ProductFull> {
  const db = await getDb();
  const images = await db.all<ProductImage>("SELECT * FROM product_images WHERE productId = ? ORDER BY sortOrder, createdAt", product.id);
  const sizes = await db.all<ProductSize>("SELECT * FROM product_sizes WHERE productId = ? ORDER BY value", product.id);
  const colors = await db.all<ProductColor>("SELECT * FROM product_colors WHERE productId = ? ORDER BY name", product.id);
  const variants = await db.all<ProductVariant>("SELECT * FROM product_variants WHERE productId = ? ORDER BY colorName, size", product.id);
  return { ...product, images, sizes, colors, variants };
}

export async function listProducts(storeId: string, publicOnly = false, filters: { q?: string; category?: string; size?: string; color?: string } = {}) {
  const db = await getDb();
  const where = ["p.storeId = ?"];
  const params: unknown[] = [storeId];
  if (publicOnly) where.push("p.isVisible = 1");
  if (filters.q) {
    where.push("LOWER(p.title) LIKE ?");
    params.push(`%${filters.q.toLowerCase()}%`);
  }
  if (filters.category) {
    where.push("p.category = ?");
    params.push(filters.category);
  }
  if (filters.size) {
    where.push("(EXISTS (SELECT 1 FROM product_sizes s WHERE s.productId = p.id AND s.value = ?) OR EXISTS (SELECT 1 FROM product_variants v WHERE v.productId = p.id AND v.size = ?))");
    params.push(filters.size, filters.size);
  }
  if (filters.color) {
    where.push("(EXISTS (SELECT 1 FROM product_colors c WHERE c.productId = p.id AND c.name = ?) OR EXISTS (SELECT 1 FROM product_variants v WHERE v.productId = p.id AND v.colorName = ?))");
    params.push(filters.color, filters.color);
  }
  const products = await db.all<Product>(`SELECT p.* FROM products p WHERE ${where.join(" AND ")} ORDER BY p.createdAt DESC`, params);
  return Promise.all(products.map(enrich));
}

export async function getProduct(id: string, storeId?: string, publicOnly = false) {
  const db = await getDb();
  const product = await db.get<Product>(
    `SELECT * FROM products WHERE id = ? ${storeId ? "AND storeId = ?" : ""} ${publicOnly ? "AND isVisible = 1" : ""}`,
    ...(storeId ? [id, storeId] : [id])
  );
  return product ? enrich(product) : null;
}

async function replaceDetails(productId: string, sizes?: string[], colors?: { name: string; hex?: string | null }[]) {
  const db = await getDb();
  if (sizes) {
    await db.run("DELETE FROM product_sizes WHERE productId = ?", productId);
    for (const value of sizes.filter(Boolean)) {
      await db.run("INSERT INTO product_sizes (id, productId, value) VALUES (?, ?, ?)", crypto.randomUUID(), productId, value);
    }
  }
  if (colors) {
    await db.run("DELETE FROM product_colors WHERE productId = ?", productId);
    for (const color of colors.filter((item) => item.name)) {
      await db.run("INSERT INTO product_colors (id, productId, name, hex) VALUES (?, ?, ?, ?)", crypto.randomUUID(), productId, color.name, color.hex ?? null);
    }
  }
}

function normalizeVariants(variants?: ProductVariantInput[]) {
  return variants
    ?.map((variant) => ({
      colorName: variant.colorName?.trim() ?? "",
      colorHex: variant.colorHex?.trim() || null,
      size: variant.size?.trim() ?? "",
      price: variant.price === "" || variant.price == null ? null : Number(variant.price)
    }))
    .filter((variant) => variant.colorName && variant.size && (variant.price === null || Number.isFinite(variant.price)));
}

function detailsFromVariants(variants: ReturnType<typeof normalizeVariants>) {
  const sizeValues = [...new Set((variants ?? []).map((variant) => variant.size))];
  const colorsByName = new Map<string, { name: string; hex: string | null }>();
  for (const variant of variants ?? []) {
    if (!colorsByName.has(variant.colorName)) colorsByName.set(variant.colorName, { name: variant.colorName, hex: variant.colorHex });
  }
  return { sizes: sizeValues, colors: [...colorsByName.values()] };
}

async function replaceVariants(productId: string, variants?: ProductVariantInput[]) {
  if (!variants) return;
  const db = await getDb();
  const normalized = normalizeVariants(variants);
  await db.run("DELETE FROM product_variants WHERE productId = ?", productId);
  for (const variant of normalized ?? []) {
    await db.run(
      "INSERT INTO product_variants (id, productId, colorName, colorHex, size, price) VALUES (?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      productId,
      variant.colorName,
      variant.colorHex,
      variant.size,
      variant.price
    );
  }
  const details = detailsFromVariants(normalized);
  await replaceDetails(productId, details.sizes, details.colors);
}

export async function createProduct(
  input: Partial<Product> & {
    storeId: string;
    title: string;
    sizes?: string[];
    colors?: { name: string; hex?: string | null }[];
    variants?: ProductVariantInput[];
  }
) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO products (id, storeId, title, description, price, priceText, category, status, isVisible, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.storeId,
    input.title,
    input.description ?? null,
    input.price ?? null,
    input.priceText ?? null,
    input.category ?? null,
    input.status ?? "AVAILABLE",
    input.isVisible ?? 1,
    now,
    now
  );
  if (input.variants) await replaceVariants(id, input.variants);
  else await replaceDetails(id, input.sizes, input.colors);
  return getProduct(id);
}

export async function updateProduct(
  id: string,
  storeId: string,
  input: Partial<Product> & { sizes?: string[]; colors?: { name: string; hex?: string | null }[]; variants?: ProductVariantInput[] }
) {
  const current = await getProduct(id, storeId);
  if (!current) return null;
  const db = await getDb();
  await db.run(
    `UPDATE products SET title = ?, description = ?, price = ?, priceText = ?, category = ?, status = ?, isVisible = ?, updatedAt = ? WHERE id = ? AND storeId = ?`,
    input.title ?? current.title,
    productField(input, "description", current.description),
    productField(input, "price", current.price),
    productField(input, "priceText", current.priceText),
    productField(input, "category", current.category),
    input.status ?? current.status,
    input.isVisible ?? current.isVisible,
    new Date().toISOString(),
    id,
    storeId
  );
  if (input.variants) await replaceVariants(id, input.variants);
  else await replaceDetails(id, input.sizes, input.colors);
  return getProduct(id, storeId);
}

function productField<K extends keyof Product>(input: Partial<Product>, key: K, fallback: Product[K]) {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

export async function deleteProduct(id: string, storeId: string) {
  const db = await getDb();
  await db.run("DELETE FROM products WHERE id = ? AND storeId = ?", id, storeId);
}

export async function addProductImage(productId: string, storeId: string, url: string) {
  const product = await getProduct(productId, storeId);
  if (!product) return null;
  const db = await getDb();
  const count = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM product_images WHERE productId = ?", productId);
  const id = crypto.randomUUID();
  await db.run(
    "INSERT INTO product_images (id, productId, url, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)",
    id,
    productId,
    url,
    count?.count ?? 0,
    new Date().toISOString()
  );
  return getProduct(productId, storeId);
}

export async function deleteProductImage(productId: string, storeId: string, imageId: string) {
  const product = await getProduct(productId, storeId);
  if (!product) return null;
  const db = await getDb();
  await db.run("DELETE FROM product_images WHERE id = ? AND productId = ?", imageId, productId);
  return getProduct(productId, storeId);
}

export async function reorderProductImages(productId: string, storeId: string, imageIds: string[]) {
  const product = await getProduct(productId, storeId);
  if (!product) return null;
  const db = await getDb();
  for (const [index, imageId] of imageIds.entries()) {
    await db.run("UPDATE product_images SET sortOrder = ? WHERE id = ? AND productId = ?", index, imageId, productId);
  }
  return getProduct(productId, storeId);
}
