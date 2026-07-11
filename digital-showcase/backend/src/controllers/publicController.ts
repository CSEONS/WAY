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

export const listProducts = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  res.json(
    await productService.listProducts(store.id, true, {
      q: req.query.q?.toString(),
      category: req.query.category?.toString(),
      size: req.query.size?.toString(),
      color: req.query.color?.toString()
    })
  );
});

export const getProduct = asyncHandler(async (req, res) => {
  const store = await publicStore(String(req.params.slug));
  const product = await productService.getProduct(String(req.params.productId), store.id, true);
  if (!product) throw new HttpError(404, "Товар не найден");
  await analyticsService.recordProductView(store.id, product.id);
  res.json({ store, product });
});
