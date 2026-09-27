import { asyncHandler, HttpError } from "../utils/http.js";
import {
  connectSchema,
  extendSchema,
  ownerCreateSchema,
  ownerPasswordSchema,
  ownerUpdateSchema,
  parseBody,
  paymentSchema,
  storeCreateSchema,
  storeUpdateSchema
} from "../utils/validation.js";
import * as auditService from "../services/auditService.js";
import * as authService from "../services/authService.js";
import * as backupService from "../services/backupService.js";
import * as onboardingService from "../services/onboardingService.js";
import * as overviewService from "../services/overviewService.js";
import * as paymentService from "../services/paymentService.js";
import * as reportService from "../services/reportService.js";
import * as userService from "../services/userService.js";
import * as storeService from "../services/storeService.js";
import { withSubscription } from "../services/subscriptionService.js";
import type { Store } from "../types/models.js";

export const listOwners = asyncHandler(async (_req, res) => res.json(await userService.listOwners()));

export const getOwner = asyncHandler(async (req, res) => {
  const owner = await userService.getOwner(String(req.params.id));
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const createOwner = asyncHandler(async (req, res) => {
  const input = parseBody(ownerCreateSchema, req.body);
  res.status(201).json(await userService.createOwner({ ...input, email: input.email ?? undefined, phone: input.phone ?? undefined }));
});

export const updateOwner = asyncHandler(async (req, res) => {
  const owner = await userService.updateOwner(String(req.params.id), parseBody(ownerUpdateSchema, req.body));
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const changeOwnerPassword = asyncHandler(async (req, res) => {
  const { password } = parseBody(ownerPasswordSchema, req.body);
  const owner = await userService.updateOwner(String(req.params.id), { password });
  if (!owner) throw new HttpError(404, "Владелец не найден");
  await auditService.logAction(req.user!.userId, "OWNER_PASSWORD_SET", { type: "owner", id: owner.id, name: owner.name });
  res.json(owner);
});

export const deleteOwner = asyncHandler(async (req, res) => {
  const owner = await userService.getOwner(String(req.params.id));
  await userService.deleteOwner(String(req.params.id));
  if (owner) await auditService.logAction(req.user!.userId, "OWNER_DELETED", { type: "owner", id: owner.id, name: owner.name });
  res.status(204).send();
});

/** «Войти как владелец»: a 2-hour session as the owner, written to the journal. */
export const impersonateOwner = asyncHandler(async (req, res) => {
  const { token, owner } = await authService.impersonate(req.user!.userId, String(req.params.id));
  await auditService.logAction(req.user!.userId, "IMPERSONATION_STARTED", { type: "owner", id: owner.id, name: owner.name });
  res.json({ token });
});

export const listStores = asyncHandler(async (_req, res) => res.json((await storeService.listStores()).map(withSubscription)));

export const overview = asyncHandler(async (_req, res) => res.json(await overviewService.adminOverview()));

/** `?name=` suggests a free address for a store name; `?slug=` checks one. */
export const checkSlug = asyncHandler(async (req, res) => {
  if (typeof req.query.name === "string") {
    res.json({ slug: await onboardingService.suggestSlug(req.query.name), available: true });
    return;
  }
  const slug = String(req.query.slug ?? "").trim().toLowerCase();
  try {
    await storeService.assertSlugAvailable(slug);
    res.json({ slug, available: true });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    res.json({ slug, available: false, message: error.message });
  }
});

/** «Подключить магазин»: owner + store + trial in one form. */
export const connectStore = asyncHandler(async (req, res) => {
  const result = await onboardingService.connectStore(parseBody(connectSchema, req.body), req.user!.userId);
  res.status(201).json({ ...result, store: withSubscription(result.store) });
});

export const listPayments = asyncHandler(async (_req, res) => {
  const [payments, byMonth] = await Promise.all([paymentService.listPayments(), paymentService.revenueByMonth(12)]);
  res.json({ payments, byMonth });
});

export const acceptPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.acceptPayment(String(req.params.id), parseBody(paymentSchema, req.body), req.user!.userId);
  await auditService.logAction(
    req.user!.userId,
    "PAYMENT_ACCEPTED",
    { type: "store", id: result.store.id, name: result.store.name },
    `${rubles(result.payment.amount)} за ${result.payment.months} мес., до ${dateLabel(result.payment.periodEnd)}`
  );
  res.status(201).json({ payment: result.payment, store: withSubscription(result.store) });
});

export const cancelPayment = asyncHandler(async (req, res) => {
  const { payment, rolledBack } = await paymentService.cancelPayment(String(req.params.id));
  await auditService.logAction(
    req.user!.userId,
    "PAYMENT_CANCELLED",
    { type: "store", id: payment.storeId, name: payment.storeName },
    `${rubles(payment.amount)} от ${dateLabel(payment.createdAt)}${rolledBack ? ", дата подписки возвращена" : ""}`
  );
  res.json({ rolledBack });
});

/** Month results of every store — for «Отправить отчёт в WhatsApp». */
export const listReports = asyncHandler(async (req, res) => {
  // By default the last finished month: that's the report to send at the start of a month.
  const month = typeof req.query.month === "string" ? req.query.month : reportService.recentMonths(2)[1];
  const [allStores, owners] = await Promise.all([storeService.listStores(), userService.listOwners()]);
  // Stores connected after this month have nothing to report.
  const stores = allStores.filter((store) => store.createdAt < reportService.monthRange(month).to);
  const reports = await Promise.all(
    stores.map(async (store) => {
      const owner = owners.find((item) => item.id === store.ownerId);
      return {
        store: { id: store.id, name: store.name, slug: store.slug, whatsapp: store.whatsapp, subscription: withSubscription(store).subscription },
        owner: { id: store.ownerId, name: owner?.name ?? store.ownerName, phone: owner?.phone ?? null },
        report: await reportService.storeMonthReport(store.id, month)
      };
    })
  );
  res.json({ month, months: reportService.recentMonths(6), reports });
});

export const listJournal = asyncHandler(async (_req, res) => res.json(await auditService.listActions()));

export const getStore = asyncHandler(async (req, res) => {
  const store = await storeService.getStore(String(req.params.id));
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const createStore = asyncHandler(async (req, res) => {
  const store = await storeService.createStore(parseBody(storeCreateSchema, req.body));
  res.status(201).json(store && withSubscription(store));
});

function rubles(amount: number) {
  return amount ? `${amount.toLocaleString("ru-RU")} ₽` : "Бесплатно";
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "без даты";
}

export const updateStore = asyncHandler(async (req, res) => {
  const input = parseBody(storeUpdateSchema, req.body);
  const before = await storeService.getStore(String(req.params.id));
  const store = await storeService.updateStore(String(req.params.id), input);
  if (!store || !before) throw new HttpError(404, "Магазин не найден");
  await logStoreChanges(req.user!.userId, before, store);
  res.json(withSubscription(store));
});

/** Manual changes of money-related fields go to the journal; payments log themselves. */
async function logStoreChanges(adminId: string, before: Store, after: Store) {
  const target = { type: "store" as const, id: after.id, name: after.name };
  if (before.subscriptionEndsAt !== after.subscriptionEndsAt) {
    await auditService.logAction(adminId, "SUBSCRIPTION_CHANGED", target, `${dateLabel(before.subscriptionEndsAt)} → ${dateLabel(after.subscriptionEndsAt)}`);
  }
  if (before.aiFormEnabled !== after.aiFormEnabled || before.aiMonthlyLimit !== after.aiMonthlyLimit) {
    const plan = (store: Store) => (store.aiFormEnabled ? `Витрина + ИИ (лимит ${store.aiMonthlyLimit ?? "по умолчанию"})` : "Витрина");
    await auditService.logAction(adminId, "PLAN_CHANGED", target, `${plan(before)} → ${plan(after)}`);
  }
}

export const deleteStore = asyncHandler(async (req, res) => {
  const store = await storeService.getStore(String(req.params.id));
  await storeService.deleteStore(String(req.params.id));
  if (store) await auditService.logAction(req.user!.userId, "STORE_DELETED", { type: "store", id: store.id, name: store.name });
  res.status(204).send();
});

/** Extension without a payment record. The admin panel uses «Принять оплату» (0 ₽ for free) instead. */
export const extendSubscription = asyncHandler(async (req, res) => {
  const { days } = parseBody(extendSchema, req.body);
  const before = await storeService.getStore(String(req.params.id));
  const store = await storeService.extendSubscription(String(req.params.id), days);
  if (!store || !before) throw new HttpError(404, "Магазин не найден");
  await logStoreChanges(req.user!.userId, before, store);
  res.json(withSubscription(store));
});

export const disableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 0 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const enableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 1 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

export const archiveStore = disableStore;

export const restoreStore = enableStore;

async function setAiForm(adminId: string, storeId: string, enabled: 0 | 1) {
  const before = await storeService.getStore(storeId);
  const store = await storeService.updateStore(storeId, { aiFormEnabled: enabled });
  if (!store || !before) throw new HttpError(404, "Магазин не найден");
  await logStoreChanges(adminId, before, store);
  return withSubscription(store);
}

export const enableAiForm = asyncHandler(async (req, res) => {
  res.json(await setAiForm(req.user!.userId, String(req.params.id), 1));
});

export const disableAiForm = asyncHandler(async (req, res) => {
  res.json(await setAiForm(req.user!.userId, String(req.params.id), 0));
});

/** Backup status for the admin panel: settings (no secrets) and the latest runs. */
export const listBackups = asyncHandler(async (_req, res) => {
  const settings = backupService.backupSettings();
  res.json({
    settings: {
      enabled: settings.enabled,
      storage: settings.s3 ? `${new URL(settings.s3.endpoint).host}/${settings.s3.bucket}/${settings.prefix}` : null,
      hour: settings.hour,
      keepLocal: settings.keepLocal,
      keepRemoteDays: settings.keepRemoteDays
    },
    runs: await backupService.listBackupRuns(10)
  });
});

/** «Сделать копию сейчас»: starts in the background, the page polls the list. */
export const startBackup = asyncHandler(async (req, res) => {
  void backupService.runBackup();
  await auditService.logAction(req.user!.userId, "BACKUP_STARTED");
  res.status(202).json({ started: true });
});
