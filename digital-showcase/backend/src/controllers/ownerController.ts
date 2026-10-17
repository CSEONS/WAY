import type { Request } from "express";
import { createBulkProductAiDraft, createProductAiDraft } from "../services/aiDraftService.js";
import * as aiUsageService from "../services/aiUsageService.js";
import { previewSettings } from "../services/aiProvider.js";
import { settings } from "../services/settingsService.js";
import * as analyticsService from "../services/analyticsService.js";
import { checkImage, cleanFindings, flagImage } from "../services/imageModerationService.js";
import { readStoredImage } from "../services/imageService.js";
import { createProductPreview, parsePreviewOptions } from "../services/previewImageService.js";
import * as paymentService from "../services/paymentService.js";
import * as productService from "../services/productService.js";
import * as reportService from "../services/reportService.js";
import * as storeService from "../services/storeService.js";
import { addingProductsBlocked, GRACE_DAYS, withSubscription } from "../services/subscriptionService.js";
import { asyncHandler, HttpError } from "../utils/http.js";
import { imageOrderSchema, parseBody, productCreateSchema, productUpdateSchema, storeDetailsSchema } from "../utils/validation.js";

/** The store from the URL, only if it belongs to the signed-in owner; someone else's store is «not found». */
async function scopedStore(req: Request) {
  const store = await storeService.getOwnerStoreById(req.user!.userId, String(req.params.storeId));
  if (!store) throw new HttpError(404, "Магазин не найден");
  return store;
}

/** The store, if new products can go on it now: not while the subscription is unpaid (see addingProductsBlocked). */
async function storeForNewProducts(req: Request) {
  const store = await scopedStore(req);
  const reason = addingProductsBlocked(store);
  if (reason) throw new HttpError(403, reason);
  return store;
}

function uploadedAiDraftFiles(req: Request) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return {
    voice: files?.voice?.[0] ?? undefined,
    images: files?.images ?? []
  };
}

/** A JSON array sent as a form field; anything else — empty. */
function parseJsonList(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return value ? [String(value)] : [];
}

export const listStores = asyncHandler(async (req, res) => {
  res.json((await storeService.listOwnerStores(req.user!.userId)).map(withSubscription));
});

export const getStore = asyncHandler(async (req, res) => {
  // aiPreviewEnabled: the server can draw previews (AI_PREVIEW_MODEL isn't "off").
  res.json({ ...withSubscription(await scopedStore(req)), aiPreviewEnabled: previewSettings() !== null });
});

/** Who to call about the subscription: «Контакты» in the admin panel. */
function supportContacts() {
  const { whatsapp, phone, telegram } = settings().support;
  return { whatsapp: whatsapp || null, phone: phone || null, telegram: telegram || null };
}

/** «Помощь» in the owner's app: who to write or call. */
export const getSupport = asyncHandler(async (_req, res) => {
  res.json(supportContacts());
});

/** «Подписка и итоги»: paid date, tariff, AI left this month, payments and month results. */
export const getSubscription = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const [ai, payments, reports] = await Promise.all([
    aiUsageService.aiStatus(store),
    paymentService.listPayments({ storeId: store.id, limit: 24 }),
    Promise.all(
      reportService
        .recentMonths(3)
        // No reports for months before the store was connected.
        .filter((month) => month >= paymentService.monthKey(new Date(store.createdAt)))
        .map((month) => reportService.storeMonthReport(store.id, month))
    )
  ]);
  res.json({
    subscription: withSubscription(store).subscription,
    graceDays: GRACE_DAYS,
    ai,
    // Admin comments stay in the admin panel.
    payments: payments.map(({ id, amount, months, method, periodEnd, receipt, createdAt }) => ({ id, amount, months, method, periodEnd, receipt, createdAt })),
    reports,
    support: supportContacts()
  });
});

export const updateStore = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const details = parseBody(storeDetailsSchema, req.body);
  res.json(await storeService.updateStore(store.id, { ...details, ownerId: store.ownerId }));
});

export const updateStoreLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Выберите изображение логотипа");
  const store = await scopedStore(req);
  const updated = await storeService.updateStoreLogo(store.id, req.file);
  // People or animals on it: hidden from buyers until a moderator looks (after the answer, it takes a few seconds).
  if (updated?.logoUrl) void checkImage({ url: updated.logoUrl, kind: "LOGO", storeId: store.id }, req.file.buffer);
  res.json(updated);
});

export const listProducts = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  res.json(await productService.listProducts(store.id));
});

export const getAnalytics = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const [productCount, analytics] = await Promise.all([productService.countProducts(store.id), analyticsService.getStoreAnalytics(store.id)]);
  res.json({ productCount, ...analytics });
});

export const getProduct = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const product = await productService.getProduct(String(req.params.id), store.id);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  const input = parseBody(productCreateSchema, req.body);
  const store = await storeForNewProducts(req);
  res.status(201).json(await productService.createProduct({ ...input, storeId: store.id }));
});

export const createProductDraft = asyncHandler(async (req, res) => {
  const store = await storeForNewProducts(req);
  if (!store.aiFormEnabled) throw new HttpError(403, "ИИ-заполнение формы не подключено");

  const { voice, images } = uploadedAiDraftFiles(req);
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt : "";
  if (!prompt.trim() && !voice) throw new HttpError(400, "Добавьте текстовое или голосовое описание товара");
  await aiUsageService.assertWithinLimit(store);

  const { result, usage } = await aiUsageService.measureTokens(() => createProductAiDraft({ prompt, voice, images, imageUrls: stringList(req.body.imageUrls) }));
  await aiUsageService.recordUsage(store.id, "DRAFT", 1, usage);
  res.json(result);
});

/** «Превью с ИИ»: a storefront cover drawn from one photo of the product. */
export const createPreview = asyncHandler(async (req, res) => {
  const store = await storeForNewProducts(req);
  if (!store.aiFormEnabled) throw new HttpError(403, "ИИ не подключён для этого магазина");
  const options = parsePreviewOptions(req.body.options);
  // A new photo comes as a file; one already saved with the product — as its address.
  const photo = req.file ?? (typeof req.body.imageUrl === "string" ? await readStoredImage(req.body.imageUrl) : null);
  if (!photo) throw new HttpError(400, "Добавьте фото товара — по нему ИИ нарисует превью");
  await aiUsageService.assertWithinLimit(store);

  const { result, usage } = await aiUsageService.measureTokens(() => createProductPreview(options, photo));
  await aiUsageService.recordUsage(store.id, "PREVIEW", aiUsageService.previewUnits(), usage);
  res.json(result);
});

export const createBulkProductDraft = asyncHandler(async (req, res) => {
  const store = await storeForNewProducts(req);
  if (!store.aiFormEnabled) throw new HttpError(403, "ИИ-заполнение формы не подключено");
  const { voice, images } = uploadedAiDraftFiles(req);
  if (images.length < 2) throw new HttpError(400, "Для массовой группировки добавьте минимум два изображения");
  const prompt = typeof req.body.prompt === "string" ? req.body.prompt : "";
  const expectedCount = Number(req.body.expectedCount);
  await aiUsageService.assertWithinLimit(store);
  const { result, usage } = await aiUsageService.measureTokens(() =>
    createBulkProductAiDraft({
      prompt,
      voice,
      images,
      expectedCount: Number.isInteger(expectedCount) && expectedCount > 0 && expectedCount <= images.length ? expectedCount : undefined
    })
  );
  await aiUsageService.recordUsage(store.id, "BULK", result.length, usage);
  res.json(result);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const input = parseBody(productUpdateSchema, req.body);
  const store = await scopedStore(req);
  const product = await productService.updateProduct(String(req.params.id), store.id, input);
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
  const added = await productService.addProductImage(String(req.params.id), store.id, req.file);
  if (!added) throw new HttpError(404, "Товар не найден");
  const ref = { url: added.url, kind: "PRODUCT" as const, storeId: store.id, productId: added.product.id };
  // «Превью с ИИ» already found people or animals on it: straight to moderation.
  // Otherwise the AI checks it after the answer (a few seconds). Either way buyers don't see it until a moderator looks.
  const previewFindings = cleanFindings(parseJsonList(req.body.livingBeings));
  if (previewFindings.length) {
    await flagImage(ref, previewFindings);
    res.status(201).json(await productService.getProduct(added.product.id, store.id));
    return;
  }
  void checkImage(ref, req.file.buffer);
  res.status(201).json(added.product);
});

export const deleteImage = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const product = await productService.deleteProductImage(String(req.params.id), store.id, String(req.params.imageId));
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});

export const reorderImages = asyncHandler(async (req, res) => {
  const store = await scopedStore(req);
  const { imageIds } = parseBody(imageOrderSchema, req.body);
  const product = await productService.reorderProductImages(String(req.params.id), store.id, imageIds);
  if (!product) throw new HttpError(404, "Товар не найден");
  res.json(product);
});
