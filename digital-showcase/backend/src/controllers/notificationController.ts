import * as auditService from "../services/auditService.js";
import * as notificationService from "../services/notificationService.js";
import { asyncHandler } from "../utils/http.js";
import { notificationReadSchema, notificationSendSchema, parseBody } from "../utils/validation.js";

/** The bell: the signed-in user's notifications and how many are unread. */
export const listMine = asyncHandler(async (req, res) => {
  res.json(await notificationService.listForUser(req.user!.userId));
});

/** Opened the bell: the given notifications (or all) are read. */
export const markRead = asyncHandler(async (req, res) => {
  const { ids } = parseBody(notificationReadSchema, req.body);
  // An admin looking into an owner's account doesn't read the owner's notifications for them.
  if (!req.user!.impersonatedBy) await notificationService.markRead(req.user!.userId, ids);
  res.json(await notificationService.listForUser(req.user!.userId));
});

/** «Уведомления» in the admin panel: to one store's owner or to every owner. */
export const sendFromAdmin = asyncHandler(async (req, res) => {
  const input = parseBody(notificationSendSchema, req.body);
  const result = await notificationService.sendFromAdmin(input);
  await auditService.logAction(req.user!.userId, "NOTIFICATION_SENT", input.storeId ? { type: "store", id: input.storeId } : undefined, input.title);
  res.status(201).json(result);
});

export const adminHistory = asyncHandler(async (_req, res) => {
  res.json(await notificationService.adminHistory());
});
