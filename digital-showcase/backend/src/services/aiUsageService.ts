import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { requestCostUsd, rublesPerDollar } from "./aiPrices.js";
import { planOf } from "./planService.js";
import { settings } from "./settingsService.js";

export type AiUsageKind = "DRAFT" | "BULK" | "PREVIEW";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** The model that answered — its price turns the tokens into rubles. */
  model?: string;
}

// Tokens reported by the AI provider during one owner request (see aiDraftService).
const scope = new AsyncLocalStorage<TokenUsage>();

/** Runs an AI call and collects the tokens every provider response inside it reports. */
export async function measureTokens<T>(run: () => Promise<T>) {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const result = await scope.run(usage, run);
  return { result, usage };
}

/** Called for each provider response with its `usage` block and the model it was sent to. */
export function reportTokens(usage: unknown, model?: string) {
  const current = scope.getStore();
  if (!current || !usage || typeof usage !== "object") return;
  if (model) current.model = model;
  // Responses API: input/output_tokens; Chat Completions: prompt/completion_tokens.
  const { input_tokens, output_tokens, prompt_tokens, completion_tokens } = usage as Record<string, unknown>;
  current.inputTokens += Number(input_tokens ?? prompt_tokens) || 0;
  current.outputTokens += Number(output_tokens ?? completion_tokens) || 0;
}

/** AI cards a store may create per calendar month: its own limit or its plan's; 0 on a plan without AI. */
export function monthlyLimit(store: Pick<Store, "aiMonthlyLimit" | "planId">) {
  if (store.aiMonthlyLimit != null && store.aiMonthlyLimit >= 0) return store.aiMonthlyLimit;
  const plan = planOf(store);
  return plan?.aiEnabled ? (plan.aiMonthlyLimit ?? 0) : 0;
}

export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export async function usedThisMonth(storeId: string, now = new Date()) {
  const db = await getDb();
  const row = await db.get<{ units: number | null }>("SELECT SUM(units) as units FROM ai_usage WHERE storeId = ? AND createdAt >= ?", storeId, monthStart(now));
  return row?.units ?? 0;
}

export async function aiStatus(store: Store) {
  return { enabled: Boolean(store.aiFormEnabled), used: await usedThisMonth(store.id), limit: monthlyLimit(store) };
}

/** Stops a request before it costs money once the month's cards are used up. */
export async function assertWithinLimit(store: Store) {
  const { used, limit } = await aiStatus(store);
  if (used >= limit) {
    throw new HttpError(
      429,
      `ИИ-помощник на этот месяц израсходован: ${used} из ${limit} карточек. Товары можно добавлять вручную, а лимит обновится 1-го числа. Чтобы увеличить лимит, напишите администратору.`
    );
  }
  return { used, limit };
}

/** Cards one AI preview takes from the month («Настройки», 1 by default): a picture costs more than a text draft. */
export function previewUnits() {
  return settings().aiPreviewUnits;
}

/** One card = one unit: a single draft is 1, a bulk upload is the number of products it produced, a preview is previewUnits(). */
export async function recordUsage(storeId: string, kind: AiUsageKind, units: number, tokens: TokenUsage) {
  const db = await getDb();
  await db.run(
    "INSERT INTO ai_usage (id, storeId, kind, units, inputTokens, outputTokens, model, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    storeId,
    kind,
    Math.max(1, units),
    tokens.inputTokens,
    tokens.outputTokens,
    tokens.model ?? null,
    new Date().toISOString()
  );
}

/** Cards each store used this month. */
export async function usageByStore(now = new Date()) {
  const db = await getDb();
  return db.all<{ storeId: string; units: number }>("SELECT storeId, SUM(units) as units FROM ai_usage WHERE createdAt >= ? GROUP BY storeId", monthStart(now));
}

/** Models in use now: they price older rows saved before the model was recorded. */
export interface CurrentModels {
  text: string;
  preview: string | null;
}

/**
 * This month's AI in rubles — what the admin compares with the price of the
 * AI plan: the total, an average card (a draft or one product of a bulk
 * upload), an average and the dearest preview. Sums are null until the
 * ruble rate is set on «Настройки»; requests to models without a known price are left
 * out of them and named in `unpricedModels`.
 */
type UsageRow = { kind: AiUsageKind; units: number; inputTokens: number; outputTokens: number; model: string | null };

/**
 * Dollars one ai_usage row cost. `unpriced` — the model has no known price;
 * null usd without it — nothing to price (a provider that doesn't report
 * usage leaves zeros).
 */
function rowCost(row: UsageRow, current: CurrentModels): { usd: number | null; unpriced: string | null } {
  const model = row.model ?? (row.kind === "PREVIEW" ? current.preview : current.text);
  if (!model || (!row.inputTokens && !row.outputTokens)) return { usd: null, unpriced: null };
  const usd = requestCostUsd(model, row.inputTokens, row.outputTokens);
  return usd == null ? { usd: null, unpriced: model } : { usd, unpriced: null };
}

/** Rubles from dollars at the rate on «Настройки», to kopecks; null when no rate is set. */
function toRubles(usd: number) {
  const rate = rublesPerDollar();
  return rate == null ? null : Math.round(usd * rate * 100) / 100;
}

export async function monthSpend(current: CurrentModels, now = new Date()) {
  const db = await getDb();
  const rows = await db.all<UsageRow>("SELECT kind, units, inputTokens, outputTokens, model FROM ai_usage WHERE createdAt >= ?", monthStart(now));
  const rate = rublesPerDollar();
  const rub = toRubles;

  let cardsUsd = 0;
  let cardUnits = 0;
  const previewsUsd: number[] = [];
  const unpriced = new Set<string>();
  for (const row of rows) {
    const { usd, unpriced: model } = rowCost(row, current);
    if (model) {
      unpriced.add(model);
    } else if (usd == null) {
      continue;
    } else if (row.kind === "PREVIEW") {
      previewsUsd.push(usd);
    } else {
      cardsUsd += usd;
      cardUnits += row.units;
    }
  }

  const previewTotal = previewsUsd.reduce((sum, usd) => sum + usd, 0);
  const total = rub(cardsUsd + previewTotal);
  return {
    rubPerUsd: rate,
    previews: rows.filter((row) => row.kind === "PREVIEW").length,
    costRub: total == null ? null : Math.round(total),
    cardRub: cardUnits ? rub(cardsUsd / cardUnits) : null,
    previewRub: previewsUsd.length ? rub(previewTotal / previewsUsd.length) : null,
    previewMaxRub: previewsUsd.length ? rub(Math.max(...previewsUsd)) : null,
    unpricedModels: [...unpriced]
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * «Расходы на ИИ» in the admin panel: the last `months` months (oldest
 * first, empty months included) and this month by store, most expensive
 * first. Cards are drafts and products of bulk uploads; `used` also counts
 * previews, as the store's limit does. Ruble sums are null until the rate is set.
 */
export async function spendReport(current: CurrentModels, now = new Date(), months = 6) {
  const db = await getDb();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await db.all<UsageRow & { createdAt: string; storeId: string; storeName: string; aiMonthlyLimit: number | null; planId: string | null }>(
    `SELECT u.kind, u.units, u.inputTokens, u.outputTokens, u.model, u.createdAt, u.storeId, s.name as storeName, s.aiMonthlyLimit, s.planId
     FROM ai_usage u JOIN stores s ON s.id = u.storeId WHERE u.createdAt >= ?`,
    from.toISOString()
  );

  const byMonth = new Map<string, { month: string; cards: number; previews: number; usd: number }>();
  for (let index = 0; index < months; index += 1) {
    const month = monthKey(new Date(from.getFullYear(), from.getMonth() + index, 1));
    byMonth.set(month, { month, cards: 0, previews: 0, usd: 0 });
  }
  const thisMonth = monthKey(now);
  const byStore = new Map<string, { storeId: string; name: string; cards: number; previews: number; used: number; limit: number; usd: number }>();
  const unpriced = new Set<string>();

  for (const row of rows) {
    const { usd, unpriced: model } = rowCost(row, current);
    if (model) unpriced.add(model);
    const isPreview = row.kind === "PREVIEW";
    const month = byMonth.get(monthKey(new Date(row.createdAt)));
    if (month) {
      month.cards += isPreview ? 0 : row.units;
      month.previews += isPreview ? 1 : 0;
      month.usd += usd ?? 0;
    }
    if (monthKey(new Date(row.createdAt)) !== thisMonth) continue;
    const store = byStore.get(row.storeId) ?? {
      storeId: row.storeId,
      name: row.storeName,
      cards: 0,
      previews: 0,
      used: 0,
      limit: monthlyLimit({ aiMonthlyLimit: row.aiMonthlyLimit, planId: row.planId }),
      usd: 0
    };
    store.cards += isPreview ? 0 : row.units;
    store.previews += isPreview ? 1 : 0;
    store.used += row.units;
    store.usd += usd ?? 0;
    byStore.set(row.storeId, store);
  }

  return {
    rubPerUsd: rublesPerDollar(),
    months: [...byMonth.values()].map(({ usd, ...month }) => ({ ...month, costRub: toRubles(usd) })),
    stores: [...byStore.values()].sort((a, b) => b.usd - a.usd || b.used - a.used).map(({ usd, ...store }) => ({ ...store, costRub: toRubles(usd) })),
    unpricedModels: [...unpriced]
  };
}
