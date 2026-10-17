import { getDb } from "../database/db.js";
import type { PaymentMethod } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { insertPayment, PAYMENT_METHODS } from "./paymentService.js";
import { getStore } from "./storeService.js";

// Packages sold on top of a plan («Тарифы и цены» → «Пакеты»): AI previews and
// AI cards, spent once the plan's month is used up and kept past the month's
// end (see aiUsageService.recordUsage), a service the admin does by hand, or a
// mix. An owner asks for one on «Подписка»; the admin takes the money and the
// store gets what's in it at once. Every request or sale is a package order
// holding a copy of the package as it was then.

export interface Package {
  id: string;
  name: string;
  /** Rubles, once. */
  price: number;
  description: string;
  /** AI previews it adds. */
  previews: number;
  /** AI cards it adds: drafts and products of a bulk upload. */
  fills: number;
  /** The admin does something by hand after payment (e.g. fills the first products in). */
  isService: number;
  /** On the landing and on the owner's «Подписка». A hidden one can still be sold by the admin. */
  isPublic: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PackageInput = Pick<Package, "name" | "price" | "description" | "previews" | "fills" | "isService" | "isPublic">;

export type PackageOrderStatus =
  /** The owner asked; nothing paid yet. */
  | "REQUESTED"
  /** Paid; the service is still to do. */
  | "PAID"
  /** Paid and given: previews and cards added, the service done. */
  | "DONE"
  /** The admin turned the request down. */
  | "DECLINED"
  /** The owner withdrew the request, or its payment was cancelled. */
  | "CANCELLED";

export interface PackageOrder {
  id: string;
  storeId: string;
  /** The package, while it exists; name, price and contents below are what was bought. */
  packageId: string | null;
  name: string;
  price: number;
  previews: number;
  fills: number;
  isService: number;
  status: PackageOrderStatus;
  paymentId: string | null;
  /** When it was requested or sold. */
  createdAt: string;
  paidAt: string | null;
  doneAt: string | null;
}

export interface PackageSale {
  /** A package straight from the list… */
  packageId?: string;
  /** …or the owner's request for one. */
  orderId?: string;
  amount: number;
  method: PaymentMethod;
  comment?: string | null;
  receipt?: string | null;
}

/** «+10 ИИ-превью, +100 карточек с ИИ, услуга» — for the journal. */
export function contentsLabel(item: Pick<Package, "previews" | "fills" | "isService">) {
  return [item.previews && `+${item.previews} ИИ-превью`, item.fills && `+${item.fills} карточек с ИИ`, item.isService && "услуга"].filter(Boolean).join(", ");
}

/** Every package in landing order, with how many times it was sold. */
export async function listPackages() {
  const db = await getDb();
  return db.all<Package & { soldCount: number }>(
    `SELECT p.*, (SELECT COUNT(*) FROM package_orders o WHERE o.packageId = p.id AND o.status IN ('PAID', 'DONE')) as soldCount
     FROM packages p ORDER BY p.sortOrder, p.createdAt`
  );
}

/** Shown packages, in order, without admin-only fields: for the landing and «Подписка». */
export async function publicPackages() {
  const db = await getDb();
  const rows = await db.all<Package>("SELECT * FROM packages WHERE isPublic = 1 ORDER BY sortOrder, createdAt");
  return rows.map(({ id, name, price, description, previews, fills, isService }) => ({ id, name, price, description, previews, fills, isService: Boolean(isService) }));
}

export async function getPackage(id: string) {
  const db = await getDb();
  return (await db.get<Package>("SELECT * FROM packages WHERE id = ?", id)) ?? null;
}

/** Creates (id null) or updates a package. Orders already made keep what they bought. */
export async function savePackage(id: string | null, input: PackageInput) {
  if (!input.previews && !input.fills && !input.isService) throw new HttpError(400, "В пакете ничего нет: добавьте превью, карточки с ИИ или отметьте услугу");
  const db = await getDb();
  const now = new Date().toISOString();
  let packageId = id;
  if (packageId) {
    if (!(await getPackage(packageId))) throw new HttpError(404, "Пакет не найден");
    await db.run(
      "UPDATE packages SET name = ?, price = ?, description = ?, previews = ?, fills = ?, isService = ?, isPublic = ?, updatedAt = ? WHERE id = ?",
      input.name,
      input.price,
      input.description,
      input.previews,
      input.fills,
      input.isService,
      input.isPublic,
      now,
      packageId
    );
  } else {
    packageId = crypto.randomUUID();
    const last = await db.get<{ sortOrder: number | null }>("SELECT MAX(sortOrder) as sortOrder FROM packages");
    await db.run(
      `INSERT INTO packages (id, name, price, description, previews, fills, isService, isPublic, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      packageId,
      input.name,
      input.price,
      input.description,
      input.previews,
      input.fills,
      input.isService,
      input.isPublic,
      (last?.sortOrder ?? -1) + 1,
      now,
      now
    );
  }
  return (await getPackage(packageId))!;
}

/** Bought ones stay with the stores, open requests can still be sold: they hold a copy. */
export async function deletePackage(id: string) {
  const item = await getPackage(id);
  if (!item) throw new HttpError(404, "Пакет не найден");
  const db = await getDb();
  await db.run("DELETE FROM packages WHERE id = ?", id);
  return item;
}

/** Landing order: the ids as they should go. Unknown ids are ignored. */
export async function reorderPackages(ids: string[]) {
  const db = await getDb();
  for (const [index, id] of ids.entries()) await db.run("UPDATE packages SET sortOrder = ? WHERE id = ?", index, id);
  return listPackages();
}

async function getOrder(id: string) {
  const db = await getDb();
  return (await db.get<PackageOrder>("SELECT * FROM package_orders WHERE id = ?", id)) ?? null;
}

/** A store's requests and purchases, newest first. */
export async function listOrders(storeId: string, limit = 20) {
  const db = await getDb();
  return db.all<PackageOrder>("SELECT * FROM package_orders WHERE storeId = ? ORDER BY createdAt DESC LIMIT ?", storeId, limit);
}

export type OpenOrder = PackageOrder & { storeName: string; ownerName: string; ownerPhone: string | null };

/** For «Нужно сделать сейчас»: requests to take money for and paid services to do, oldest first. */
export async function openOrders() {
  const db = await getDb();
  return db.all<OpenOrder>(
    `SELECT o.*, s.name as storeName, u.name as ownerName, u.phone as ownerPhone
     FROM package_orders o JOIN stores s ON s.id = o.storeId JOIN users u ON u.id = s.ownerId
     WHERE o.status IN ('REQUESTED', 'PAID') ORDER BY o.createdAt`
  );
}

/** «Хочу этот пакет» on «Подписка»: one open request per package. */
export async function requestPackage(storeId: string, packageId: string) {
  const item = await getPackage(packageId);
  if (!item || !item.isPublic) throw new HttpError(404, "Такого пакета нет");
  const db = await getDb();
  const open = await db.get<{ id: string }>("SELECT id FROM package_orders WHERE storeId = ? AND packageId = ? AND status = 'REQUESTED'", storeId, packageId);
  if (open) throw new HttpError(409, "Запрос на этот пакет уже отправлен — администратор свяжется с вами");
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO package_orders (id, storeId, packageId, name, price, previews, fills, isService, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?)`,
    id,
    storeId,
    item.id,
    item.name,
    item.price,
    item.previews,
    item.fills,
    item.isService,
    new Date().toISOString()
  );
  return (await getOrder(id))!;
}

/** An open request: withdrawn by the owner (CANCELLED) or turned down by the admin (DECLINED). */
export async function closeRequest(orderId: string, status: "CANCELLED" | "DECLINED", storeId?: string) {
  const order = await getOrder(orderId);
  if (!order || (storeId && order.storeId !== storeId)) throw new HttpError(404, "Запрос не найден");
  if (order.status !== "REQUESTED") throw new HttpError(409, "Запрос уже обработан");
  const db = await getDb();
  await db.run("UPDATE package_orders SET status = ? WHERE id = ?", status, orderId);
  return { ...order, status };
}

/**
 * The admin took the money: a payment that extends nothing, the order paid
 * (done at once unless there's a service to do), previews and cards added to
 * the store's balance.
 */
export async function sellPackage(storeId: string, sale: PackageSale, adminId: string | null) {
  if (!Number.isInteger(sale.amount) || sale.amount < 0) throw new HttpError(400, "Сумма — целое число рублей, 0 — в подарок");
  if (!PAYMENT_METHODS.includes(sale.method)) throw new HttpError(400, "Неизвестный способ оплаты");
  const store = await getStore(storeId);
  if (!store) throw new HttpError(404, "Магазин не найден");

  let request: PackageOrder | null = null;
  let bought: Pick<PackageOrder, "packageId" | "name" | "price" | "previews" | "fills" | "isService">;
  if (sale.orderId) {
    request = await getOrder(sale.orderId);
    if (!request || request.storeId !== storeId) throw new HttpError(404, "Запрос не найден");
    if (request.status !== "REQUESTED") throw new HttpError(409, "Запрос уже обработан");
    bought = request;
  } else {
    const item = sale.packageId ? await getPackage(sale.packageId) : null;
    if (!item) throw new HttpError(404, "Такого пакета нет");
    bought = { packageId: item.id, name: item.name, price: item.price, previews: item.previews, fills: item.fills, isService: item.isService };
  }

  const now = new Date().toISOString();
  const payment = await insertPayment({
    storeId,
    storeName: store.name,
    amount: sale.amount,
    months: 0,
    method: sale.method,
    comment: sale.comment?.trim() || null,
    periodStart: null,
    periodEnd: null,
    createdBy: adminId,
    receipt: sale.receipt?.trim() || null,
    packageName: bought.name,
    createdAt: now
  });

  const db = await getDb();
  const status: PackageOrderStatus = bought.isService ? "PAID" : "DONE";
  const doneAt = status === "DONE" ? now : null;
  const orderId = request?.id ?? crypto.randomUUID();
  if (request) {
    await db.run("UPDATE package_orders SET status = ?, paymentId = ?, paidAt = ?, doneAt = ? WHERE id = ?", status, payment.id, now, doneAt, orderId);
  } else {
    await db.run(
      `INSERT INTO package_orders (id, storeId, packageId, name, price, previews, fills, isService, status, paymentId, createdAt, paidAt, doneAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      storeId,
      bought.packageId,
      bought.name,
      bought.price,
      bought.previews,
      bought.fills,
      bought.isService,
      status,
      payment.id,
      now,
      now,
      doneAt
    );
  }
  await db.run("UPDATE stores SET extraPreviews = extraPreviews + ?, extraFills = extraFills + ? WHERE id = ?", bought.previews, bought.fills, storeId);
  return { order: (await getOrder(orderId))!, payment, store: (await getStore(storeId))! };
}

/** «Выполнено»: the paid service is done. */
export async function completeService(orderId: string) {
  const order = await getOrder(orderId);
  if (!order) throw new HttpError(404, "Заказ не найден");
  if (order.status !== "PAID") throw new HttpError(409, order.status === "DONE" ? "Уже выполнено" : "Пакет ещё не оплачен");
  const doneAt = new Date().toISOString();
  const db = await getDb();
  await db.run("UPDATE package_orders SET status = 'DONE', doneAt = ? WHERE id = ?", doneAt, orderId);
  return { ...order, status: "DONE" as const, doneAt };
}

/**
 * Its payment was cancelled: what's left of the package goes back (previews
 * and cards already spent stay spent), the order is cancelled. Null — not a package payment.
 */
export async function returnPackage(paymentId: string) {
  const db = await getDb();
  const order = await db.get<PackageOrder>("SELECT * FROM package_orders WHERE paymentId = ?", paymentId);
  if (!order) return null;
  await db.run(
    "UPDATE stores SET extraPreviews = MAX(0, extraPreviews - ?), extraFills = MAX(0, extraFills - ?) WHERE id = ?",
    order.previews,
    order.fills,
    order.storeId
  );
  await db.run("UPDATE package_orders SET status = 'CANCELLED' WHERE id = ?", order.id);
  return order;
}
