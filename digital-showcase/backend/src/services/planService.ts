import { getDb, rawDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";

// Plans the admin creates on «Тарифы и цены»: name, price, what's in it, and
// what it unlocks — for now the AI helper with its monthly limit. A store
// points at one plan (stores.planId). Its AI switch (stores.aiFormEnabled),
// which the owner's app and routes check, is a copy of the plan's aiEnabled
// kept here: set when the store gets a plan and when the plan changes.

export interface Plan {
  id: string;
  name: string;
  /** Rubles a month; null — «Цена по запросу». */
  price: number | null;
  description: string;
  features: string[];
  /** The AI helper: drafts from photos and voice, bulk upload, previews. */
  aiEnabled: number;
  /** AI cards a month on this plan; null when there's no AI. A store can have its own. */
  aiMonthlyLimit: number | null;
  /** «Полная версия»: month results in the owner's app any day. Without it they arrive in a notification at the month's end. */
  reportsAnytime: number;
  /** The plan most people should pick: accented on the landing. At most one. */
  highlighted: number;
  /** Shown on the landing. A hidden plan still works for the stores on it. */
  isPublic: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PlanInput = Pick<Plan, "name" | "price" | "description" | "features" | "aiEnabled" | "aiMonthlyLimit" | "highlighted" | "isPublic"> &
  Partial<Pick<Plan, "reportsAnytime">>;

type PlanRow = Omit<Plan, "features"> & { features: string };

function fromRow(row: PlanRow): Plan {
  let features: string[] = [];
  try {
    features = JSON.parse(row.features);
  } catch {
    // A broken list shows as no features.
  }
  return { ...row, features: Array.isArray(features) ? features.map(String) : [] };
}

/** Every plan in landing order, with how many stores are on it. */
export async function listPlans() {
  const db = await getDb();
  const rows = await db.all<PlanRow & { storeCount: number }>(
    "SELECT p.*, (SELECT COUNT(*) FROM stores s WHERE s.planId = p.id) as storeCount FROM plans p ORDER BY p.sortOrder, p.createdAt"
  );
  return rows.map((row) => ({ ...fromRow(row), storeCount: row.storeCount }));
}

/** The landing's plans: shown ones, in order, without admin-only fields. */
export async function publicPlans() {
  const db = await getDb();
  const rows = await db.all<PlanRow>("SELECT * FROM plans WHERE isPublic = 1 ORDER BY sortOrder, createdAt");
  return rows.map(fromRow).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    description: plan.description,
    features: plan.features,
    highlighted: Boolean(plan.highlighted),
    /** «До N карточек с ИИ в месяц» on the card; null — no AI. */
    aiMonthlyLimit: plan.aiEnabled ? plan.aiMonthlyLimit : null
  }));
}

export async function getPlan(id: string) {
  const db = await getDb();
  const row = await db.get<PlanRow>("SELECT * FROM plans WHERE id = ?", id);
  return row ? fromRow(row) : null;
}

/** A store's plan, read on the spot (sync: the AI limit is checked in sync code). */
export function planOf(store: Pick<Store, "planId">) {
  if (!store.planId) return null;
  const row = rawDb().prepare("SELECT * FROM plans WHERE id = ?").get(store.planId) as PlanRow | undefined;
  return row ? fromRow(row) : null;
}

/**
 * The plan a new store gets when none is chosen: the first in landing order —
 * with or without AI if that's asked (older callers only knew the AI switch).
 */
export function defaultPlan(withAi?: boolean) {
  const filter = withAi === undefined ? "" : "WHERE aiEnabled = ?";
  const row = rawDb()
    .prepare(`SELECT * FROM plans ${filter} ORDER BY sortOrder, createdAt LIMIT 1`)
    .get(...(withAi === undefined ? [] : [withAi ? 1 : 0])) as PlanRow | undefined;
  return row ? fromRow(row) : null;
}

/** The plan to put a store on: the chosen one, which must exist, or the default. */
export function resolvePlan(planId: string | null | undefined, withAi?: boolean) {
  if (planId) {
    const plan = planOf({ planId });
    if (!plan) throw new HttpError(400, "Такого тарифа нет");
    return plan;
  }
  const plan = defaultPlan(withAi) ?? defaultPlan();
  if (!plan) throw new HttpError(500, "Нет ни одного тарифа — создайте его в «Тарифы и цены»");
  return plan;
}

/** Creates (id null) or updates a plan. Stores on it follow its AI switch at once. */
export async function savePlan(id: string | null, input: PlanInput) {
  const db = await getDb();
  const now = new Date().toISOString();
  const aiMonthlyLimit = input.aiEnabled ? input.aiMonthlyLimit : null;
  let planId = id;
  if (planId) {
    const current = await getPlan(planId);
    if (!current) throw new HttpError(404, "Тариф не найден");
    await db.run(
      `UPDATE plans SET name = ?, price = ?, description = ?, features = ?, aiEnabled = ?, aiMonthlyLimit = ?, highlighted = ?, isPublic = ?, reportsAnytime = ?, updatedAt = ? WHERE id = ?`,
      input.name,
      input.price,
      input.description,
      JSON.stringify(input.features),
      input.aiEnabled,
      aiMonthlyLimit,
      input.highlighted,
      input.isPublic,
      input.reportsAnytime ? 1 : 0,
      now,
      planId
    );
  } else {
    planId = crypto.randomUUID();
    const last = await db.get<{ sortOrder: number | null }>("SELECT MAX(sortOrder) as sortOrder FROM plans");
    await db.run(
      `INSERT INTO plans (id, name, price, description, features, aiEnabled, aiMonthlyLimit, highlighted, isPublic, reportsAnytime, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      planId,
      input.name,
      input.price,
      input.description,
      JSON.stringify(input.features),
      input.aiEnabled,
      aiMonthlyLimit,
      input.highlighted,
      input.isPublic,
      input.reportsAnytime ? 1 : 0,
      (last?.sortOrder ?? -1) + 1,
      now,
      now
    );
  }
  // One accented plan at most: the newly highlighted one takes it over.
  if (input.highlighted) await db.run("UPDATE plans SET highlighted = 0 WHERE id != ?", planId);
  await db.run("UPDATE stores SET aiFormEnabled = ? WHERE planId = ?", input.aiEnabled, planId);
  return (await getPlan(planId))!;
}

/** Only a plan nobody is on, and never the last one. */
export async function deletePlan(id: string) {
  const db = await getDb();
  const plan = await getPlan(id);
  if (!plan) throw new HttpError(404, "Тариф не найден");
  const stores = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM stores WHERE planId = ?", id);
  if (stores?.count) {
    throw new HttpError(409, `На тарифе «${plan.name}» магазинов: ${stores.count}. Переведите их на другой тариф или просто скройте этот с лендинга`);
  }
  const total = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM plans");
  if ((total?.count ?? 0) <= 1) throw new HttpError(400, "Должен остаться хотя бы один тариф");
  await db.run("DELETE FROM plans WHERE id = ?", id);
  return plan;
}

/** Landing order: the ids as they should go. Unknown ids are ignored. */
export async function reorderPlans(ids: string[]) {
  const db = await getDb();
  for (const [index, id] of ids.entries()) await db.run("UPDATE plans SET sortOrder = ? WHERE id = ?", index, id);
  return listPlans();
}
