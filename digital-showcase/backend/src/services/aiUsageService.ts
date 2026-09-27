import { AsyncLocalStorage } from "node:async_hooks";
import { getDb } from "../database/db.js";
import type { Store } from "../types/models.js";
import { HttpError } from "../utils/http.js";

export type AiUsageKind = "DRAFT" | "BULK";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Tokens reported by the AI provider during one owner request (see aiDraftService).
const scope = new AsyncLocalStorage<TokenUsage>();

/** Runs an AI call and collects the tokens every provider response inside it reports. */
export async function measureTokens<T>(run: () => Promise<T>) {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const result = await scope.run(usage, run);
  return { result, usage };
}

/** Called for each provider response with its `usage` block. */
export function reportTokens(usage: unknown) {
  const current = scope.getStore();
  if (!current || !usage || typeof usage !== "object") return;
  // Responses API: input/output_tokens; Chat Completions: prompt/completion_tokens.
  const { input_tokens, output_tokens, prompt_tokens, completion_tokens } = usage as Record<string, unknown>;
  current.inputTokens += Number(input_tokens ?? prompt_tokens) || 0;
  current.outputTokens += Number(output_tokens ?? completion_tokens) || 0;
}

/** AI cards a store may create per calendar month («Витрина + ИИ»). */
export function monthlyLimit(store: Pick<Store, "aiMonthlyLimit">) {
  if (store.aiMonthlyLimit != null && store.aiMonthlyLimit >= 0) return store.aiMonthlyLimit;
  const fallback = Number(process.env.AI_MONTHLY_LIMIT);
  return Number.isInteger(fallback) && fallback >= 0 ? fallback : 100;
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

/** One card = one unit: a single draft is 1, a bulk upload is the number of products it produced. */
export async function recordUsage(storeId: string, kind: AiUsageKind, units: number, tokens: TokenUsage) {
  const db = await getDb();
  await db.run(
    "INSERT INTO ai_usage (id, storeId, kind, units, inputTokens, outputTokens, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    storeId,
    kind,
    Math.max(1, units),
    tokens.inputTokens,
    tokens.outputTokens,
    new Date().toISOString()
  );
}

/** Rubles for the tokens, when AI_RUB_PER_1M_INPUT_TOKENS / AI_RUB_PER_1M_OUTPUT_TOKENS are set; otherwise null. */
export function estimateCost(tokens: TokenUsage) {
  const input = Number(process.env.AI_RUB_PER_1M_INPUT_TOKENS);
  const output = Number(process.env.AI_RUB_PER_1M_OUTPUT_TOKENS);
  if (!(input > 0) && !(output > 0)) return null;
  return Math.round(((tokens.inputTokens * (input || 0)) + (tokens.outputTokens * (output || 0))) / 1_000_000);
}

/** Per store for the current month: cards and tokens. */
export async function usageByStore(now = new Date()) {
  const db = await getDb();
  return db.all<{ storeId: string; units: number; inputTokens: number; outputTokens: number }>(
    "SELECT storeId, SUM(units) as units, SUM(inputTokens) as inputTokens, SUM(outputTokens) as outputTokens FROM ai_usage WHERE createdAt >= ? GROUP BY storeId",
    monthStart(now)
  );
}
