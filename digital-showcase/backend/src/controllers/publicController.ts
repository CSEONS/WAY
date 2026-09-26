import { asyncHandler, HttpError } from "../utils/http.js";
import * as storeService from "../services/storeService.js";
import * as productService from "../services/productService.js";
import * as analyticsService from "../services/analyticsService.js";

async function publicStore(slug: string) {
  const store = await storeService.getStoreBySlug(slug);
  if (!store) throw new HttpError(404, "Магазин не найден");
  if (!storeService.isSubscriptionValid(store)) throw new HttpError(403, "Магазин временно недоступен");
  return store;
}

export const getStore = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  await analyticsService.recordStoreView(store.id);
  res.json(store);
});

const SORTS: productService.ProductSort[] = ["new", "price-asc", "price-desc"];
const MAX_PAGE_SIZE = 60;

/**
 * Visible products of a storefront. Optional: search/filters, `sort`,
 * `ids` (comma-separated, for favorites) and `limit`/`offset` paging.
 * The total for the same filters is in the X-Total-Count header.
 */
export const listProducts = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  const filters: productService.ProductFilters = {
    q: req.query.q?.toString() || undefined,
    category: req.query.category?.toString() || undefined,
    size: req.query.size?.toString() || undefined,
    color: req.query.color?.toString() || undefined,
    ids: req.query.ids !== undefined ? String(req.query.ids).split(",").filter(Boolean).slice(0, 200) : undefined
  };
  const sort = SORTS.find((value) => value === req.query.sort) ?? "new";
  const limit = Number(req.query.limit);
  const offset = Number(req.query.offset);
  const [products, total] = await Promise.all([
    productService.listProducts(store.id, true, filters, {
      sort,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : undefined,
      offset: Number.isFinite(offset) && offset > 0 ? offset : 0
    }),
    productService.countProducts(store.id, true, filters)
  ]);
  res.setHeader("X-Total-Count", String(total));
  res.json(products);
});

/** Categories, sizes and colors to filter by — across all visible products, not just the loaded page. */
export const getFilters = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  res.json(await productService.listFacets(store.id));
});

const CHANNELS: analyticsService.ContactChannel[] = ["whatsapp", "telegram", "phone"];

/** Sent with navigator.sendBeacon when a buyer opens WhatsApp/Telegram or calls. */
export const recordContactClick = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  const channel = CHANNELS.find((value) => value === req.body?.channel);
  if (!channel) throw new HttpError(400, "Неизвестный способ связи");
  const requestedProductId = typeof req.body.productId === "string" ? req.body.productId : null;
  const product = requestedProductId ? await productService.getProduct(requestedProductId, store.id, true) : null;
  await analyticsService.recordContactClick(store.id, product?.id ?? null, channel);
  res.status(204).send();
});

export const getProduct = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  const product = await productService.getProduct(String(req.params.productId), store.id, true);
  if (!product) throw new HttpError(404, "Товар не найден");
  await analyticsService.recordProductView(store.id, product.id);
  res.json({ store, product });
});
