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

/** «Показывать» (APPROVED) or «Скрыть» (REJECTED). Recorded in the journal. */
export const reviewImage = asyncHandler(async (req, res) => {
  const { status } = parseBody(moderationReviewSchema, req.body);
  const check = await moderation.review(String(req.params.id), status, req.user!.userId);
  await auditService.logAction(req.user!.userId, status === "APPROVED" ? "IMAGE_APPROVED" : "IMAGE_REJECTED", { type: "store", id: check.storeId });
  res.status(204).send();
});
