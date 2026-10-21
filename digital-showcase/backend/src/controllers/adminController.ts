import { asyncHandler, HttpError } from "../utils/http.js";
import {
  connectSchema,
  ownerCreateSchema,
  ownerPasswordSchema,
  ownerUpdateSchema,
  packageSaleSchema,
  packageSchema,
  packageSortSchema,
  parseBody,
  paymentSchema,
  planOrderSchema,
  planSchema,
  receiptSchema,
  settingsSchema,
  storeCreateSchema,
  storeUpdateSchema
} from "../utils/validation.js";
import { knownModels } from "../services/aiPrices.js";
import * as aiProvider from "../services/aiProvider.js";
import * as aiUsageService from "../services/aiUsageService.js";
import * as auditService from "../services/auditService.js";
import * as authService from "../services/authService.js";
import * as backupService from "../services/backupService.js";
import * as notificationService from "../services/notificationService.js";
import * as onboardingService from "../services/onboardingService.js";
import * as overviewService from "../services/overviewService.js";
import * as packageService from "../services/packageService.js";
import * as paymentService from "../services/paymentService.js";
import * as planService from "../services/planService.js";
import * as reportService from "../services/reportService.js";
import * as settingsService from "../services/settingsService.js";
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

export const setPaymentReceipt = asyncHandler(async (req, res) => {
  const { receipt } = parseBody(receiptSchema, req.body);
  res.json(await paymentService.setReceipt(String(req.params.id), receipt ?? null));
});

export const cancelPayment = asyncHandler(async (req, res) => {
  const { payment, rolledBack } = await paymentService.cancelPayment(String(req.params.id));
  // A package sale: what's left of it goes back.
  const returned = payment.packageName ? await packageService.returnPackage(payment.id) : null;
  await auditService.logAction(
    req.user!.userId,
    "PAYMENT_CANCELLED",
    { type: "store", id: payment.storeId, name: payment.storeName },
    `${rubles(payment.amount)} от ${dateLabel(payment.createdAt)}${rolledBack ? ", дата подписки возвращена" : ""}${returned ? `, пакет «${returned.name}» отменён` : ""}`
  );
  res.json({ rolledBack });
});

/** «Продать пакет»: from the list or the owner's request; the money is recorded like any payment. */
export const sellPackage = asyncHandler(async (req, res) => {
  const result = await packageService.sellPackage(String(req.params.id), parseBody(packageSaleSchema, req.body), req.user!.userId);
  await auditService.logAction(
    req.user!.userId,
    "PACKAGE_SOLD",
    { type: "store", id: result.store.id, name: result.store.name },
    `«${result.order.name}» (${packageService.contentsLabel(result.order)}) за ${rubles(result.payment.amount)}`
  );
  res.status(201).json(result);
});

/** The owner's request turned down: nothing paid, nothing added. */
export const declinePackageOrder = asyncHandler(async (req, res) => {
  const order = await packageService.closeRequest(String(req.params.id), "DECLINED");
  await auditService.logAction(req.user!.userId, "PACKAGE_DECLINED", { type: "store", id: order.storeId }, `Запрос пакета «${order.name}»`);
  res.json(order);
});

/** «Выполнено»: the paid service is done. */
export const completePackageOrder = asyncHandler(async (req, res) => {
  const order = await packageService.completeService(String(req.params.id));
  await auditService.logAction(req.user!.userId, "PACKAGE_DONE", { type: "store", id: order.storeId }, `«${order.name}»`);
  res.json(order);
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
  if (before.planId !== after.planId || before.aiMonthlyLimit !== after.aiMonthlyLimit) {
    const plan = (store: Store) => {
      const name = planService.planOf(store)?.name ?? "без тарифа";
      return store.aiMonthlyLimit == null ? name : `${name} (свой лимит ИИ ${store.aiMonthlyLimit})`;
    };
    await auditService.logAction(adminId, "PLAN_CHANGED", target, `${plan(before)} → ${plan(after)}`);
  }
}

export const deleteStore = asyncHandler(async (req, res) => {
  const store = await storeService.getStore(String(req.params.id));
  await storeService.deleteStore(String(req.params.id));
  if (store) await auditService.logAction(req.user!.userId, "STORE_DELETED", { type: "store", id: store.id, name: store.name });
  res.status(204).send();
});

export const disableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 0 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});

/**
 * «Отклонить» on an overdue store: the admin no longer serves it. The
 * storefront goes off and the owner is told why; a payment or «Восстановить»
 * brings it back.
 */
export const declineStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 0, servingEndedAt: new Date().toISOString() });
  if (!store) throw new HttpError(404, "Магазин не найден");
  await notificationService.notifyStoreOwner(store.id, {
    source: "SYSTEM",
    title: "Магазин больше не обслуживается",
    body: `Подписка магазина «${store.name}» не продлена, и обслуживание прекращено: витрина выключена, покупатели её не видят. Чтобы возобновить работу, напишите администратору и оплатите подписку.`,
    link: `/dashboard/stores/${store.id}/subscription`,
    topic: `serving:${store.id}`
  });
  await auditService.logAction(req.user!.userId, "STORE_DECLINED", { type: "store", id: store.id, name: store.name });
  res.json(store);
});

export const enableStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(String(req.params.id), { isActive: 1 });
  if (!store) throw new HttpError(404, "Магазин не найден");
  res.json(store);
});



/** «Скачать на компьютер»: a fresh copy of the database as a .sqlite.gz file. Recorded in the journal. */
export const downloadBackup = asyncHandler(async (req, res) => {
  const { name, data } = await backupService.databaseCopy();
  await auditService.logAction(req.user!.userId, "BACKUP_DOWNLOADED", undefined, name);
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(data);
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
    runs: await backupService.listBackupRuns(10),
    // The running copy's stage for the progress bar; null when none is running.
    progress: backupService.backupProgress()
  });
});

/** «Сделать копию сейчас»: starts in the background, the page polls the list. */
export const startBackup = asyncHandler(async (req, res) => {
  void backupService.runBackup();
  await auditService.logAction(req.user!.userId, "BACKUP_STARTED");
  res.status(202).json({ started: true });
});

/** Where AI requests go (no key) — for the admin panel. */
export const aiStatus = asyncHandler(async (_req, res) => {
  res.json(aiProvider.aiSummary());
});

/** «Тарифы и цены»: every plan with how many stores are on it. */
export const listPlans = asyncHandler(async (_req, res) => {
  res.json(await planService.listPlans());
});

export const createPlan = asyncHandler(async (req, res) => {
  const plan = await planService.savePlan(null, parseBody(planSchema, req.body));
  await auditService.logAction(req.user!.userId, "PLAN_SAVED", undefined, `Новый тариф «${plan.name}»`);
  res.status(201).json(plan);
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await planService.savePlan(String(req.params.id), parseBody(planSchema, req.body));
  await auditService.logAction(req.user!.userId, "PLAN_SAVED", undefined, `Тариф «${plan.name}»`);
  res.json(plan);
});

export const deletePlan = asyncHandler(async (req, res) => {
  const plan = await planService.deletePlan(String(req.params.id));
  await auditService.logAction(req.user!.userId, "PLAN_DELETED", undefined, `Тариф «${plan.name}»`);
  res.status(204).send();
});

export const reorderPlans = asyncHandler(async (req, res) => {
  res.json(await planService.reorderPlans(parseBody(planOrderSchema, req.body).ids));
});

/** «Тарифы и цены» → «Пакеты»: every package with how many times it was sold. */
export const listPackages = asyncHandler(async (_req, res) => {
  res.json(await packageService.listPackages());
});

export const createPackage = asyncHandler(async (req, res) => {
  const item = await packageService.savePackage(null, parseBody(packageSchema, req.body));
  await auditService.logAction(req.user!.userId, "PACKAGE_SAVED", undefined, `Новый пакет «${item.name}»`);
  res.status(201).json(item);
});

export const updatePackage = asyncHandler(async (req, res) => {
  const item = await packageService.savePackage(String(req.params.id), parseBody(packageSchema, req.body));
  await auditService.logAction(req.user!.userId, "PACKAGE_SAVED", undefined, `Пакет «${item.name}»`);
  res.json(item);
});

export const deletePackage = asyncHandler(async (req, res) => {
  const item = await packageService.deletePackage(String(req.params.id));
  await auditService.logAction(req.user!.userId, "PACKAGE_DELETED", undefined, `Пакет «${item.name}»`);
  res.status(204).send();
});

export const reorderPackages = asyncHandler(async (req, res) => {
  res.json(await packageService.reorderPackages(parseBody(packageSortSchema, req.body).ids));
});

/** «Расходы на ИИ»: the last 6 months and this month by store. */
export const aiSpend = asyncHandler(async (_req, res) => {
  res.json(await aiUsageService.spendReport({ text: aiProvider.aiSettings().model, preview: aiProvider.previewSettings()?.model ?? null }));
});

/** «Настройки»: plans, contacts, requisites, the trial and AI — plus priced model names to pick from. */
export const getSettings = asyncHandler(async (_req, res) => {
  res.json({ settings: settingsService.settings(), models: knownModels() });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const saved = settingsService.saveSettings(parseBody(settingsSchema, req.body));
  await auditService.logAction(req.user!.userId, "SETTINGS_CHANGED");
  res.json({ settings: saved, models: knownModels() });
});

/** «Проверить»: one tiny request to the configured provider, e.g. right after switching it. */
export const checkAi = asyncHandler(async (_req, res) => {
  const startedAt = Date.now();
  try {
    const answer = await aiProvider.completeJson({ instructions: "Отвечай только JSON-объектом.", text: 'Верни {"ok": true}' });
    res.json({ ok: /"ok"\s*:\s*true/.test(answer), ms: Date.now() - startedAt, answer: answer.slice(0, 200) });
  } catch (error) {
    res.json({ ok: false, ms: Date.now() - startedAt, message: error instanceof Error ? error.message : String(error) });
  }
});
