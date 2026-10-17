import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";
import { requestCostUsd, rublesPerDollar } from "./aiPrices.js";
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

/** AI cards a store may create per calendar month («Витрина + ИИ»): its own limit or the one on «Настройки». */
export function monthlyLimit(store: Pick<Store, "aiMonthlyLimit">) {
  if (store.aiMonthlyLimit != null && store.aiMonthlyLimit >= 0) return store.aiMonthlyLimit;
  return settings().aiMonthlyLimit;
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
export async function monthSpend(current: CurrentModels, now = new Date()) {
  const db = await getDb();
  const rows = await db.all<{ kind: AiUsageKind; units: number; inputTokens: number; outputTokens: number; model: string | null }>(
    "SELECT kind, units, inputTokens, outputTokens, model FROM ai_usage WHERE createdAt >= ?",
    monthStart(now)
  );
  const rate = rublesPerDollar();
  const rub = (usd: number) => (rate == null ? null : Math.round(usd * rate * 100) / 100);

  let cardsUsd = 0;
  let cardUnits = 0;
  const previewsUsd: number[] = [];
  const unpriced = new Set<string>();
  for (const row of rows) {
    const model = row.model ?? (row.kind === "PREVIEW" ? current.preview : current.text);
    // A provider that doesn't report usage leaves zeros — no price to learn from them.
    if (!model || (!row.inputTokens && !row.outputTokens)) continue;
    const usd = requestCostUsd(model, row.inputTokens, row.outputTokens);
    if (usd == null) {
      unpriced.add(model);
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
