import { asyncHandler, HttpError, requireFields } from "../utils/http.js";
import * as storeService from "../services/storeService.js";
import * as productService from "../services/productService.js";

async function currentStore(ownerId: string) {
  const store = await storeService.getOwnerStore(ownerId);
  if (!store) throw new HttpError(404, "Для владельца еще не создан магазин");
  return store;
}

export const getStore = asyncHandler(async (req, res) => {
  res.json(await currentStore(req.user!.userId));
});

export const updateStore = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  res.json(await storeService.updateStore(store.id, { ...req.body, ownerId: store.ownerId }));
});

export const listProducts = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  res.json(await productService.listProducts(store.id));
});

export const getProduct = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  const product = await productService.getProduct(String(req.params.id), store.id);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  requireFields(req.body, ["title"]);
  const store = await currentStore(req.user!.userId);
  res.status(201).json(await productService.createProduct({ ...req.body, storeId: store.id }));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  const product = await productService.updateProduct(String(req.params.id), store.id, req.body);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  await productService.deleteProduct(String(req.params.id), store.id);
  res.status(204).send();
});

export const addImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Файл не загружен");
  const store = await currentStore(req.user!.userId);
  const product = await productService.addProductImage(String(req.params.id), store.id, `/uploads/${req.file.filename}`);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.status(201).json(product);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const store = await currentStore(req.user!.userId);
  const product = await productService.deleteProductImage(String(req.params.id), store.id, String(req.params.imageId));
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});
