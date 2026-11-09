// What the OpenAI organization really spent, day by day: the figures behind
// platform.openai.com/usage, read through OpenAI's own Usage and Costs API.
// That takes an Admin key — OPENAI_ADMIN_KEY in .env, made at
// platform.openai.com → Settings → Organization → Admin keys; the key the
// site's AI requests go with can't read spending. The settings pages
// themselves aren't read: they need the owner's browser sign-in, and the API
// returns the same numbers.

const DAY_SECONDS = 24 * 60 * 60;
/** The admin panel may be opened often; OpenAI's figures don't change by the second. */
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 20_000;
/** A guard against a cursor that never ends. */
const MAX_PAGES = 12;

export interface OpenAiUsageDay {
  /** A UTC day, "2026-11-09": OpenAI counts days in UTC. */
  date: string;
  inputTokens: number;
  outputTokens: number;
  /** Requests to the text models. */
  requests: number;
  /** Dollars billed for everything that day: text, pictures, voice. */
  usd: number;
}

export function openAiAdminKey() {
  return process.env.OPENAI_ADMIN_KEY?.trim() ?? "";
}

function baseUrl() {
  return (process.env.OPENAI_ADMIN_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

interface Bucket<T> {
  start_time: number;
  results?: T[];
}

interface CostResult {
  amount?: { value?: number | string; currency?: string };
}

interface CompletionsResult {
  input_tokens?: number;
  output_tokens?: number;
  num_model_requests?: number;
}

/** Every day bucket of one endpoint, following its page cursor. */
async function readBuckets<T>(path: string, params: Record<string, string>) {
  const buckets: Bucket<T>[] = [];
  let page: string | null = null;
  for (let count = 0; count < MAX_PAGES; count += 1) {
    const url = new URL(`${baseUrl()}${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    if (page) url.searchParams.set("page", page);
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${openAiAdminKey()}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new Error("Не удалось связаться с OpenAI: сервер не достучался до api.openai.com");
    }
    const body = (await response.json().catch(() => null)) as {
      data?: Bucket<T>[];
      has_more?: boolean;
      next_page?: string | null;
      error?: { message?: string };
    } | null;
    if (response.status === 401) throw new Error("OpenAI не принял ключ OPENAI_ADMIN_KEY — проверьте, что он скопирован целиком");
    if (response.status === 403) {
      throw new Error("Этому ключу расходы не видны: нужен Admin-ключ организации (Settings → Organization → Admin keys), обычный ключ проекта не подойдёт");
    }
    if (!response.ok) throw new Error(`OpenAI ответил ошибкой: ${body?.error?.message ?? response.status}`);
    buckets.push(...(body?.data ?? []));
    if (!body?.has_more || !body.next_page) break;
    page = body.next_page;
  }
  return buckets;
}

function utcDate(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

const cache = new Map<number, { at: number; days: OpenAiUsageDay[] }>();

/**
 * The last `days` UTC days, oldest first, today so far the last: dollars from
 * the Costs API, tokens and requests from the completions usage. Read again
 * at most every few minutes unless `refresh`.
 */
export async function openAiUsageByDay(days: number, { refresh = false, now = new Date() } = {}): Promise<OpenAiUsageDay[]> {
  const cached = cache.get(days);
  if (!refresh && cached && now.getTime() - cached.at < CACHE_MS) return cached.days;

  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000 - (days - 1) * DAY_SECONDS;
  const range = { start_time: String(start), end_time: String(Math.floor(now.getTime() / 1000)), bucket_width: "1d" };
  const [costs, usage] = await Promise.all([
    readBuckets<CostResult>("/organization/costs", { ...range, limit: String(Math.min(days, 180)) }),
    readBuckets<CompletionsResult>("/organization/usage/completions", { ...range, limit: String(Math.min(days, 31)) })
  ]);

  const byDate = new Map<string, OpenAiUsageDay>();
  for (let index = 0; index < days; index += 1) {
    const date = utcDate(start + index * DAY_SECONDS);
    byDate.set(date, { date, inputTokens: 0, outputTokens: 0, requests: 0, usd: 0 });
  }
  for (const bucket of costs) {
    const day = byDate.get(utcDate(bucket.start_time));
    if (!day) continue;
    for (const result of bucket.results ?? []) day.usd += Number(result.amount?.value) || 0;
  }
  for (const bucket of usage) {
    const day = byDate.get(utcDate(bucket.start_time));
    if (!day) continue;
    for (const result of bucket.results ?? []) {
      day.inputTokens += Number(result.input_tokens) || 0;
      day.outputTokens += Number(result.output_tokens) || 0;
      day.requests += Number(result.num_model_requests) || 0;
    }
  }

  const result = [...byDate.values()];
  cache.set(days, { at: now.getTime(), days: result });
  return result;
}
