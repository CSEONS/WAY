import { getDb } from "../database/db.js";
import type { Payment, PaymentMethod } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { getStore, updateStore } from "./storeService.js";
import { addMonths, extensionBase } from "./subscriptionService.js";

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "TRANSFER", "OTHER"];
export const MAX_MONTHS = 12;

export interface PaymentInput {
  amount: number;
  months: number;
  method: PaymentMethod;
  comment?: string | null;
  receipt?: string | null;
}

/** «Принять оплату»: records the money and extends the subscription by whole months in one step. */
export async function acceptPayment(storeId: string, input: PaymentInput, adminId: string | null) {
  if (!Number.isInteger(input.amount) || input.amount < 0) throw new HttpError(400, "Сумма — целое число рублей, 0 для бесплатного продления");
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > MAX_MONTHS) throw new HttpError(400, `Период — от 1 до ${MAX_MONTHS} месяцев`);
  if (!PAYMENT_METHODS.includes(input.method)) throw new HttpError(400, "Неизвестный способ оплаты");

  const store = await getStore(storeId);
  if (!store) throw new HttpError(404, "Магазин не найден");

  const periodEnd = addMonths(extensionBase(store), input.months).toISOString();
  const payment: Payment = {
    id: crypto.randomUUID(),
    storeId,
    storeName: store.name,
    amount: input.amount,
    months: input.months,
    method: input.method,
    comment: input.comment?.trim() || null,
    periodStart: store.subscriptionEndsAt,
    periodEnd,
    createdBy: adminId,
    receipt: input.receipt?.trim() || null,
    createdAt: new Date().toISOString()
  };
  const db = await getDb();
  await db.run(
    `INSERT INTO payments (id, storeId, storeName, amount, months, method, comment, periodStart, periodEnd, createdBy, receipt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    payment.id,
    payment.storeId,
    payment.storeName,
    payment.amount,
    payment.months,
    payment.method,
    payment.comment,
    payment.periodStart,
    payment.periodEnd,
    payment.createdBy,
    payment.receipt,
    payment.createdAt
  );
  const updated = await updateStore(storeId, { subscriptionEndsAt: periodEnd, isActive: 1 });
  return { payment, store: updated! };
}

/**
 * A payment entered by mistake. If it is the latest extension of the store,
 * the paid date goes back to what it was before; otherwise only the record is removed.
 */
export async function cancelPayment(paymentId: string) {
  const db = await getDb();
  const payment = await db.get<Payment>("SELECT * FROM payments WHERE id = ?", paymentId);
  if (!payment) throw new HttpError(404, "Оплата не найдена");

  const store = await getStore(payment.storeId);
  const rolledBack = Boolean(store && store.subscriptionEndsAt === payment.periodEnd);
  await db.run("DELETE FROM payments WHERE id = ?", paymentId);
  if (store && rolledBack) await updateStore(store.id, { subscriptionEndsAt: payment.periodStart });
  return { payment, rolledBack };
}

/** A receipt issued after the payment was recorded (or a corrected one). */
export async function setReceipt(paymentId: string, receipt: string | null) {
  const db = await getDb();
  const payment = await db.get<Payment>("SELECT * FROM payments WHERE id = ?", paymentId);
  if (!payment) throw new HttpError(404, "Оплата не найдена");
  await db.run("UPDATE payments SET receipt = ? WHERE id = ?", receipt?.trim() || null, paymentId);
  return { ...payment, receipt: receipt?.trim() || null };
}

export async function listPayments(filter: { storeId?: string; limit?: number } = {}) {
  const db = await getDb();
  if (filter.storeId) {
    return db.all<Payment>("SELECT * FROM payments WHERE storeId = ? ORDER BY createdAt DESC LIMIT ?", filter.storeId, filter.limit ?? 100);
  }
  return db.all<Payment>("SELECT * FROM payments ORDER BY createdAt DESC LIMIT ?", filter.limit ?? 500);
}

/** "YYYY-MM" of a date in the server's time zone. */
export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Money received per calendar month, the last `months` months including the current one (oldest first). */
export async function revenueByMonth(months = 6, now = new Date()) {
  const db = await getDb();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await db.all<{ amount: number; createdAt: string }>("SELECT amount, createdAt FROM payments WHERE createdAt >= ?", from.toISOString());
  const totals = new Map<string, { total: number; count: number }>();
  for (let index = 0; index < months; index++) totals.set(monthKey(new Date(from.getFullYear(), from.getMonth() + index, 1)), { total: 0, count: 0 });
  for (const row of rows) {
    const bucket = totals.get(monthKey(new Date(row.createdAt)));
    if (!bucket) continue;
    bucket.total += row.amount;
    if (row.amount > 0) bucket.count += 1;
  }
  return [...totals.entries()].map(([month, value]) => ({ month, ...value }));
}
