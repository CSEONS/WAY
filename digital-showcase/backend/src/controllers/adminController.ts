import { asyncHandler, HttpError, requireFields } from "../utils/http.js";
import * as auditService from "../services/auditService.js";
import * as authService from "../services/authService.js";
import * as onboardingService from "../services/onboardingService.js";
import * as overviewService from "../services/overviewService.js";
import * as paymentService from "../services/paymentService.js";
import * as reportService from "../services/reportService.js";
import * as userService from "../services/userService.js";
import * as storeService from "../services/storeService.js";
import { withSubscription } from "../services/subscriptionService.js";
import type { PaymentMethod, Store } from "../types/models.js";

export const listOwners = asyncHandler(async (_req, res) => res.json(await userService.listOwners()));

export const getOwner = asyncHandler(async (req, res) => {
  const owner = await userService.getOwner(String(req.params.id));
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const createOwner = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name", "password"]);
  res.status(201).json(await userService.createOwner(req.body));
});

export const updateOwner = asyncHandler(async (req, res) => {
  const owner = await userService.updateOwner(String(req.params.id), req.body);
  if (!owner) throw new HttpError(404, "Владелец не найден");
  res.json(owner);
});

export const changeOwnerPassword = asyncHandler(async (req, res) => {
  requireFields(req.body, ["password"]);
  const owner = await userService.updateOwner(String(req.params.id), { password: req.body.password });
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
  const body = req.body ?? {};
  const result = await onboardingService.connectStore(
    {
      ownerName: String(body.ownerName ?? ""),
      phone: String(body.phone ?? ""),
      email: body.email ? String(body.email) : null,
      storeName: String(body.storeName ?? ""),
      slug: String(body.slug ?? ""),
      storePhone: body.storePhone ? String(body.storePhone) : null,
      withAi: body.withAi === true,
      trialDays: Number(body.trialDays),
      leadId: body.leadId ? String(body.leadId) : null
    },
    req.user!.userId
  );
  res.status(201).json({ ...result, store: withSubscription(result.store) });
});

export const listPayments = asyncHandler(async (_req, res) => {
  const [payments, byMonth] = await Promise.all([paymentService.listPayments(), paymentService.revenueByMonth(12)]);
  res.json({ payments, byMonth });
});

export const acceptPayment = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  const result = await paymentService.acceptPayment(
    String(req.params.id),
    { amount: Number(body.amount), months: Number(body.months), method: body.method as PaymentMethod, comment: body.comment ? String(body.comment) : null },
    req.user!.userId
  );
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
  requireFields(req.body, ["ownerId", "name", "slug"]);
  const { ownerId, name, slug, description, address, phone, whatsapp, telegram, workingHours, isActive, aiFormEnabled, subscriptionEndsAt, aiMonthlyLimit } = req.body;
  const store = await storeService.createStore({
    ownerId,
    name,
    slug,
    description,
    address,
    phone,
    whatsapp,
    telegram,
    workingHours,
    isActive,
    aiFormEnabled,
    subscriptionEndsAt,
    aiMonthlyLimit: limitValue(aiMonthlyLimit)
  });
  res.status(201).json(store && withSubscription(store));
});

/** «Лимит ИИ»: empty — the default, otherwise a whole number of cards. */
function limitValue(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0) throw new HttpError(400, "Лимит ИИ — целое число карточек в месяц");
  return limit;
}

function rubles(amount: number) {
  return amount ? `${amount.toLocaleString("ru-RU")} ₽` : "Бесплатно";
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "без даты";
}

export const updateStore = asyncHandler(async (req, res) => {
  const { ownerId, name, slug, description, address, phone, whatsapp, telegram, workingHours, isActive, aiFormEnabled, subscriptionEndsAt, aiMonthlyLimit } = req.body;
  const before = await storeService.getStore(String(req.params.id));
  const store = await storeService.updateStore(String(req.params.id), {
    ownerId,
    name,
    slug,
    description,
    address,
    phone,
    whatsapp,
    telegram,
    workingHours,
    isActive,
    aiFormEnabled,
    subscriptionEndsAt,
    aiMonthlyLimit: limitValue(aiMonthlyLimit)
  });
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
  const days = Number(req.body.days ?? 30);
  if (!Number.isFinite(days) || days <= 0) throw new HttpError(400, "days должен быть положительным числом");
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
