import { getDb } from "../database/db.js";
import type { Product, ProductColor, ProductFull, ProductImage, ProductSize, ProductVariant } from "../types/models.js";
import { deleteStoredImage, storeProductImage, type UploadedImage } from "./imageService.js";

type ProductVariantInput = {
  colorName?: string;
  colorHex?: string | null;
  size?: string;
  price?: number | string | null;
};

function groupByProduct<T extends { productId: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.productId);
    if (group) group.push(row);
    else groups.set(row.productId, [row]);
  }
  return groups;
}

/** Loads images, sizes, colors and variants for many products in 4 queries instead of 4 per product. */
async function enrichMany(products: Product[]): Promise<ProductFull[]> {
  if (!products.length) return [];
  const db = await getDb();
  const ids = products.map((product) => product.id);
  const inList = ids.map(() => "?").join(", ");
  const [images, sizes, colors, variants] = await Promise.all([
    db.all<ProductImage>(`SELECT * FROM product_images WHERE productId IN (${inList}) ORDER BY sortOrder, createdAt`, ids),
    db.all<ProductSize>(`SELECT * FROM product_sizes WHERE productId IN (${inList}) ORDER BY value`, ids),
    db.all<ProductColor>(`SELECT * FROM product_colors WHERE productId IN (${inList}) ORDER BY name`, ids),
    db.all<ProductVariant>(`SELECT * FROM product_variants WHERE productId IN (${inList}) ORDER BY colorName, size`, ids)
  ]);
  const imagesBy = groupByProduct(images);
  const sizesBy = groupByProduct(sizes);
  const colorsBy = groupByProduct(colors);
  const variantsBy = groupByProduct(variants);
  return products.map((product) => ({
    ...product,
    images: imagesBy.get(product.id) ?? [],
    sizes: sizesBy.get(product.id) ?? [],
    colors: colorsBy.get(product.id) ?? [],
    variants: variantsBy.get(product.id) ?? []
  }));
}

async function enrich(product: Product): Promise<ProductFull> {
  const [full] = await enrichMany([product]);
  return full;
}

export type ProductSort = "new" | "price-asc" | "price-desc";

export interface ProductFilters {
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  /** Only these products (the buyer's favorites). */
  ids?: string[];
}

/** Own price, or the cheapest variant — what the buyer sees as «from». */
const EFFECTIVE_PRICE = "COALESCE(p.price, (SELECT MIN(v.price) FROM product_variants v WHERE v.productId = p.id))";

const ORDER_BY: Record<ProductSort, string> = {
  new: "p.createdAt DESC",
  "price-asc": `${EFFECTIVE_PRICE} IS NULL, ${EFFECTIVE_PRICE} ASC, p.createdAt DESC`,
  "price-desc": `${EFFECTIVE_PRICE} IS NULL, ${EFFECTIVE_PRICE} DESC, p.createdAt DESC`
};

function productWhere(storeId: string, publicOnly: boolean, filters: ProductFilters) {
  const where = ["p.storeId = ?"];
  const params: unknown[] = [storeId];
  if (publicOnly) where.push("p.isVisible = 1");
  if (filters.q) {
    // ulower(): Unicode-aware lower(); SQLite's own LOWER() ignores Cyrillic.
    where.push("(ulower(p.title) LIKE ? OR ulower(p.category) LIKE ?)");
    const pattern = `%${filters.q.toLowerCase()}%`;
    params.push(pattern, pattern);
  }
  if (filters.ids) {
    if (!filters.ids.length) where.push("0");
    else {
      where.push(`p.id IN (${filters.ids.map(() => "?").join(", ")})`);
      params.push(...filters.ids);
    }
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
  return { sql: where.join(" AND "), params };
}

export async function listProducts(
  storeId: string,
  publicOnly = false,
  filters: ProductFilters = {},
  options: { sort?: ProductSort; limit?: number; offset?: number } = {}
) {
  const db = await getDb();
  const { sql, params } = productWhere(storeId, publicOnly, filters);
  const page = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))} OFFSET ${Math.max(0, Math.floor(options.offset ?? 0))}` : "";
  const products = await db.all<Product>(`SELECT p.* FROM products p WHERE ${sql} ORDER BY ${ORDER_BY[options.sort ?? "new"]}${page}`, params);
  return enrichMany(products);
}

export async function countProducts(storeId: string, publicOnly = false, filters: ProductFilters = {}) {
  const db = await getDb();
  const { sql, params } = productWhere(storeId, publicOnly, filters);
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM products p WHERE ${sql}`, params);
  return row?.count ?? 0;
}

/** Filter options of a storefront: categories, sizes and colors of its visible products. */
export async function listFacets(storeId: string) {
  const db = await getDb();
  const [categories, sizes, colors] = await Promise.all([
    db.all<{ category: string }>(
      "SELECT DISTINCT category FROM products WHERE storeId = ? AND isVisible = 1 AND category IS NOT NULL AND category != '' ORDER BY category",
      storeId
    ),
    db.all<{ value: string }>(
      "SELECT DISTINCT s.value FROM product_sizes s JOIN products p ON p.id = s.productId WHERE p.storeId = ? AND p.isVisible = 1",
      storeId
    ),
    db.all<{ name: string; hex: string | null }>(
      "SELECT c.name, MAX(c.hex) as hex FROM product_colors c JOIN products p ON p.id = c.productId WHERE p.storeId = ? AND p.isVisible = 1 GROUP BY c.name ORDER BY c.name",
      storeId
    )
  ]);
  return {
    categories: categories.map((row) => row.category),
    sizes: sizes.map((row) => row.value),
    colors: colors.map((row) => ({ name: row.name, hex: row.hex }))
  };
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

async function replaceVariants(productId: string, variants?: ProductVariantInput[], fallbackSizes?: string[], fallbackColors?: { name: string; hex?: string | null }[]) {
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
  await replaceDetails(productId, normalized?.length ? details.sizes : fallbackSizes ?? [], normalized?.length ? details.colors : fallbackColors ?? []);
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
  if (input.variants) await replaceVariants(id, input.variants, input.sizes, input.colors);
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
  if (input.variants) await replaceVariants(id, input.variants, input.sizes, input.colors);
  else await replaceDetails(id, input.sizes, input.colors);
  return getProduct(id, storeId);
}

function productField<K extends keyof Product>(input: Partial<Product>, key: K, fallback: Product[K]) {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

export async function deleteProduct(id: string, storeId: string) {
  const product = await getProduct(id, storeId);
  const db = await getDb();
  await db.run("DELETE FROM products WHERE id = ? AND storeId = ?", id, storeId);
  await Promise.all((product?.images ?? []).map((image) => deleteStoredImage(image.url)));
}

export async function addProductImage(productId: string, storeId: string, file: UploadedImage) {
  const product = await getProduct(productId, storeId);
  if (!product) return null;
  const url = await storeProductImage(file);
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
  const image = await db.get<ProductImage>("SELECT * FROM product_images WHERE id = ? AND productId = ?", imageId, productId);
  await db.run("DELETE FROM product_images WHERE id = ? AND productId = ?", imageId, productId);
  await deleteStoredImage(image?.url);
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
