import type { Request } from "express";
import { createProductAiDraft } from "../services/aiDraftService.js";
import * as productService from "../services/productService.js";
import * as storeService from "../services/storeService.js";
import { asyncHandler, HttpError, requireFields } from "../utils/http.js";

async function firstOwnerStore(ownerId: string) {
  const store = await storeService.getOwnerStore(ownerId);
  if (!store) throw new HttpError(404, "Для владельца еще не создан магазин");
  return store;
}

async function ownerStore(ownerId: string, storeId: string) {
  const store = await storeService.getOwnerStoreById(ownerId, storeId);
  if (!store) throw new HttpError(404, "Магазин не найден");
  return store;
}

async function scopedStore(req: Request) {
  return req.params.storeId ? ownerStore(req.user!.userId, String(req.params.storeId)) : firstOwnerStore(req.user!.userId);
}

export const listStores = asyncHandler(async (req, res) => {
  res.json(await storeService.listOwnerStores(req.user!.userId));
});

export const getStore = asyncHandler(async (req, res) => {
  res.json(await scopedStore(req));
});

export const updateStore = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  res.json(await storeService.updateStore(store.id, { ...req.body, ownerId: store.ownerId }));
});

export const listProducts = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  res.json(await productService.listProducts(store.id));
});

export const getProduct = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const product = await productService.getProduct(String(req.params.id), store.id);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  requireFields(req.body, ["title"]);
  const store = await scopedStore(req);
  res.status(201).json(await productService.createProduct({ ...req.body, storeId: store.id }));
});

export const createProductDraft = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  if (!store.aiFormEnabled) throw new HttpError(403, "ИИ-заполнение формы не подключено");

  if (req.file) {
    res.json(
      createProductAiDraft(
        `Голосовая запись получена сервером: ${req.file.originalname || "voice.webm"}, ${req.file.size} байт. Подключите серверное распознавание речи, чтобы извлекать параметры товара из аудио.`
      )
    );
    return;
  }

  requireFields(req.body, ["prompt"]);
  res.json(createProductAiDraft(String(req.body.prompt)));
});

export const updateProduct = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const product = await productService.updateProduct(String(req.params.id), store.id, req.body);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  await productService.deleteProduct(String(req.params.id), store.id);
  res.status(204).send();
});

export const addImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Файл не загружен");
  const store = await scopedStore(req);
  const product = await productService.addProductImage(String(req.params.id), store.id, `/uploads/${req.file.filename}`);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.status(201).json(product);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const product = await productService.deleteProductImage(String(req.params.id), store.id, String(req.params.imageId));
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const reorderImages = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.map(String) : [];
  const product = await productService.reorderProductImages(String(req.params.id), store.id, imageIds);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});
