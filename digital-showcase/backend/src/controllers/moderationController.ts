import * as auditService from "../services/auditService.js";
import * as moderation from "../services/imageModerationService.js";
import { asyncHandler } from "../utils/http.js";
import { moderationReviewSchema, parseBody } from "../utils/validation.js";

const STATUSES: moderation.ModerationStatus[] = ["PENDING", "APPROVED", "REJECTED"];

/** Photos and logos where the AI found people or animals: waiting (default), shown or hidden. */
export const listImages = asyncHandler(async (req, res) => {
  const status = STATUSES.find((value) => value === req.query.status) ?? "PENDING";
  res.json(await moderation.listChecks(status));
});

/** «Снятые товары»: products the admin took off the storefront. */
export const listBlockedProducts = asyncHandler(async (_req, res) => {
  res.json(await moderation.listBlockedProducts());
});

/** «Вернуть на витрину». Recorded in the journal. */
export const unblockProduct = asyncHandler(async (req, res) => {
  const product = await moderation.unblockProduct(String(req.params.id));
  await auditService.logAction(req.user!.userId, "PRODUCT_UNBLOCKED", { type: "store", id: product.storeId }, product.title);
  res.status(204).send();
});

const JOURNAL: Record<moderation.ReviewDecision, auditService.AuditAction> = {
  APPROVED: "IMAGE_APPROVED",
  REJECTED: "IMAGE_REJECTED",
  PRODUCT_BLOCKED: "PRODUCT_BLOCKED"
};

/** «Показывать» (APPROVED), «Скрыть фото» (REJECTED) or «Снять товар» (PRODUCT_BLOCKED). Recorded in the journal. */
export const reviewImage = asyncHandler(async (req, res) => {
  const { status } = parseBody(moderationReviewSchema, req.body);
  const check = await moderation.review(String(req.params.id), status, req.user!.userId);
  await auditService.logAction(req.user!.userId, JOURNAL[status], { type: "store", id: check.storeId });
  res.status(204).send();
});
