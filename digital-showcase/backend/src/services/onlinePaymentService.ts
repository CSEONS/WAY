import { getDb, rawDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { sendTelegram } from "../utils/telegram.js";
import {
  createYookassaPayment,
  getYookassaPayment,
  yookassaAmount,
  yookassaConfigured,
  yookassaReceiptsOn,
  YookassaError,
  type YookassaPayment,
  type YookassaReceipt
} from "../utils/yookassa.js";
import { reportProblem } from "./alertService.js";
import { logAction } from "./auditService.js";
import { notifyStoreOwner } from "./notificationService.js";
import { acceptPayment } from "./paymentService.js";
import { planOf } from "./planService.js";
import { getStore } from "./storeService.js";
import { subscriptionInfo } from "./subscriptionService.js";

// The owner pays the plan on «Подписка и оплата» through ЮKassa: a row here
// for every attempt, a redirect to ЮKassa's page, and once ЮKassa says it's
// paid — the same extension the admin's «Продлить» makes (paymentService),
// method ONLINE. Paid is learned from ЮKassa's notification, from the owner
// coming back to the page, or from the page being opened later: whichever is
// first applies it, the others find it done.

/** Periods the owner picks from; the price is the plan's month times this. */
export const ONLINE_MONTHS = [1, 3, 6, 12];
/** A receipt from ЮKassa goes to the owner by email; the payment shows «Чек от ЮKassa». */
export const YOOKASSA_RECEIPT = "от ЮKassa";

export type OnlinePaymentStatus = "PENDING" | "SUCCEEDED" | "CANCELED";

export interface OnlinePayment {
  id: string;
  storeId: string;
  /** ЮKassa's payment id; null until it's created there. */
  externalId: string | null;
  planName: string;
  months: number;
  /** Rubles asked. */
  amount: number;
  status: OnlinePaymentStatus;
  /** The recorded payment once it succeeded. */
  paymentId: string | null;
  /** The owner who started it. */
  createdBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * What the owner can pay online now, or null: ЮKassa isn't set up in .env,
 * the plan has no price («по запросу») or is free, the store has no end date,
 * or the admin turned it off — then it's the admin who extends it.
 */
export function onlineOffer(store: Pick<Store, "planId" | "isActive" | "subscriptionEndsAt">) {
  if (!yookassaConfigured()) return null;
  const plan = planOf(store);
  if (!plan?.price || plan.price <= 0) return null;
  const { state } = subscriptionInfo(store);
  if (state === "unlimited" || state === "disabled") return null;
  return { planName: plan.name, price: plan.price, months: ONLINE_MONTHS };
}

async function getOnlinePayment(id: string) {
  const db = await getDb();
  return (await db.get<OnlinePayment>("SELECT * FROM online_payments WHERE id = ?", id)) ?? null;
}

function siteOrigin() {
  return (process.env.PUBLIC_ORIGIN || process.env.CORS_ORIGIN || "http://localhost").replace(/\/+$/, "");
}

/** The owner's email, or the phone as ЮKassa wants it (79001234567): where the receipt goes. */
async function receiptFor(ownerId: string, description: string, amount: number): Promise<YookassaReceipt> {
  const db = await getDb();
  const owner = await db.get<{ email: string | null; phone: string | null }>("SELECT email, phone FROM users WHERE id = ?", ownerId);
  const email = owner?.email?.trim();
  let phone = owner?.phone?.replace(/\D/g, "") ?? "";
  if (phone.length === 11 && phone.startsWith("8")) phone = `7${phone.slice(1)}`;
  if (!email && phone.length < 11) throw new HttpError(409, "Для чека нужна почта или телефон — укажите их в «Разделы» → «Аккаунт»");

  const vatCode = Number(process.env.YOOKASSA_VAT_CODE) || 1;
  const taxSystem = Number(process.env.YOOKASSA_TAX_SYSTEM);
  return {
    customer: email ? { email } : { phone },
    items: [
      {
        description: description.slice(0, 128),
        quantity: 1,
        amount: { value: yookassaAmount(amount), currency: "RUB" },
        vat_code: vatCode,
        payment_subject: "service",
        payment_mode: "full_payment",
        measure: "piece"
      }
    ],
    ...(taxSystem >= 1 && taxSystem <= 6 ? { tax_system_code: taxSystem } : {})
  };
}

/** «Оплатить»: a payment on ЮKassa for the store's plan; the owner is sent to `confirmationUrl`. */
export async function startOnlinePayment(storeId: string, months: number, userId: string) {
  const store = await getStore(storeId);
  if (!store) throw new HttpError(404, "Магазин не найден");
  const offer = onlineOffer(store);
  if (!offer) throw new HttpError(409, "Онлайн-оплата для этого магазина недоступна — продлите подписку у администратора");
  if (!offer.months.includes(months)) throw new HttpError(400, `Период — ${offer.months.join(", ")} мес.`);

  // Payments are whole rubles; a plan priced with kopecks is rounded.
  const amount = Math.round(offer.price * months);
  const description = `Подписка «${offer.planName}» на ${months} мес. — витрина «${store.name}»`;
  const receipt = yookassaReceiptsOn() ? await receiptFor(store.ownerId, description, amount) : undefined;
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.run(
    `INSERT INTO online_payments (id, storeId, planName, months, amount, status, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    id,
    store.id,
    offer.planName,
    months,
    amount,
    userId,
    new Date().toISOString()
  );

  let payment: YookassaPayment;
  try {
    payment = await createYookassaPayment(
      {
        amount,
        description,
        returnUrl: `${siteOrigin()}/dashboard/stores/${store.id}/subscription?payment=${id}`,
        metadata: { onlinePaymentId: id, storeId: store.id },
        receipt
      },
      id
    );
  } catch (error) {
    await db.run("UPDATE online_payments SET status = 'CANCELED', finishedAt = ? WHERE id = ?", new Date().toISOString(), id);
    await reportProblem("ЮKassa не создала платёж", error, `Магазин «${store.name}», ${amount} ₽`);
    throw new HttpError(502, "Не удалось перейти к оплате — попробуйте ещё раз через минуту или напишите администратору");
  }
  await db.run("UPDATE online_payments SET externalId = ? WHERE id = ?", payment.id, id);
  if (!payment.confirmation?.confirmation_url) throw new HttpError(502, "ЮKassa не вернула страницу оплаты — попробуйте ещё раз");
  return { id, confirmationUrl: payment.confirmation.confirmation_url };
}

/** Paid: the subscription is extended once, however many times ЮKassa's answer arrives. */
async function succeed(row: OnlinePayment, remote: YookassaPayment) {
  const finishedAt = new Date().toISOString();
  const claimed = rawDb()
    .prepare("UPDATE online_payments SET status = 'SUCCEEDED', finishedAt = ? WHERE id = ? AND status = 'PENDING'")
    .run(finishedAt, row.id).changes;
  if (!claimed) return (await getOnlinePayment(row.id))!;

  // What ЮKassa took, which is what was asked.
  const amount = Math.round(Number(remote.amount.value));
  try {
    const { payment, store } = await acceptPayment(
      row.storeId,
      { amount, months: row.months, method: "ONLINE", comment: `ЮKassa, платёж ${remote.id}`, receipt: yookassaReceiptsOn() ? YOOKASSA_RECEIPT : null },
      null
    );
    const db = await getDb();
    await db.run("UPDATE online_payments SET paymentId = ? WHERE id = ?", payment.id, row.id);
    const until = new Date(payment.periodEnd!).toLocaleDateString("ru-RU");
    const money = `${amount.toLocaleString("ru-RU")} ₽`;
    await logAction(row.createdBy, "PAYMENT_ONLINE", { type: "store", id: store.id, name: store.name }, `${money} за ${row.months} мес., до ${until}`);
    await notifyStoreOwner(store.id, {
      source: "SYSTEM",
      title: "Оплата получена",
      body: `Подписка «${row.planName}» продлена до ${until}. Спасибо!`,
      link: `/dashboard/stores/${store.id}/subscription`
    });
    void sendTelegram(`Онлайн-оплата: «${store.name}» — ${money} за ${row.months} мес., подписка до ${until}`);
  } catch (error) {
    // Money taken but nothing extended (e.g. the store was deleted meanwhile): the admin sorts it out by hand.
    await reportProblem("Оплата через ЮKassa прошла, но подписка не продлена", error, `Платёж ${remote.id}, магазин ${row.storeId}, ${amount} ₽`);
  }
  return (await getOnlinePayment(row.id))!;
}

async function apply(row: OnlinePayment, remote: YookassaPayment) {
  if (row.status !== "PENDING") return row;
  if (remote.status === "succeeded") return succeed(row, remote);
  if (remote.status === "canceled") {
    const db = await getDb();
    await db.run("UPDATE online_payments SET status = 'CANCELED', finishedAt = ? WHERE id = ? AND status = 'PENDING'", new Date().toISOString(), row.id);
    return (await getOnlinePayment(row.id))!;
  }
  return row;
}

/** The owner came back from ЮKassa: its status, asked from ЮKassa if still pending. */
export async function checkOnlinePayment(id: string, storeId: string) {
  const row = await getOnlinePayment(id);
  if (!row || row.storeId !== storeId) throw new HttpError(404, "Оплата не найдена");
  if (row.status !== "PENDING" || !row.externalId) return row;
  try {
    return await apply(row, await getYookassaPayment(row.externalId));
  } catch (error) {
    console.error("ЮKassa status check failed", error);
    return row;
  }
}

/**
 * Pending payments of the store from the last day, asked again: paid ones
 * are applied even if the notification never came and the owner didn't come back.
 */
export async function syncPending(storeId: string) {
  if (!yookassaConfigured()) return;
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.all<OnlinePayment>(
    "SELECT * FROM online_payments WHERE storeId = ? AND status = 'PENDING' AND externalId IS NOT NULL AND createdAt >= ?",
    storeId,
    since
  );
  for (const row of rows) {
    try {
      await apply(row, await getYookassaPayment(row.externalId!));
    } catch (error) {
      console.error("ЮKassa status check failed", error);
    }
  }
}

/**
 * ЮKassa's HTTP notification. Its body isn't trusted: the payment is read
 * back from ЮKassa with the shop's key. Null — not one of ours (or no ЮKassa).
 * A failure to read it throws, so the answer isn't 200 and ЮKassa sends it again.
 */
export async function handleNotification(body: unknown) {
  if (!yookassaConfigured()) return null;
  const { event, object } = (body ?? {}) as { event?: unknown; object?: { id?: unknown } };
  // Refunds and other events carry another object: only a payment's end is applied.
  if (event !== "payment.succeeded" && event !== "payment.canceled") return null;
  if (typeof object?.id !== "string" || !object.id) return null;

  let remote: YookassaPayment;
  try {
    remote = await getYookassaPayment(object.id);
  } catch (error) {
    // A made-up id (anyone can post here): ЮKassa doesn't know it.
    if (error instanceof YookassaError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
  const id = remote.metadata?.onlinePaymentId;
  const row = id ? await getOnlinePayment(id) : null;
  if (!row || row.storeId !== remote.metadata?.storeId) return null;
  if (!row.externalId) {
    const db = await getDb();
    await db.run("UPDATE online_payments SET externalId = ? WHERE id = ?", remote.id, row.id);
  }
  return apply({ ...row, externalId: remote.id }, remote);
}
