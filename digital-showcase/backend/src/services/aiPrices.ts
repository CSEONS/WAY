import { settings } from "./settingsService.js";

// What the AI models cost, so the admin panel can show rubles per card and per
// preview instead of tokens. Dollars per million tokens, from
// https://developers.openai.com/api/docs/pricing (checked 17.10.2026). Update
// here when OpenAI changes prices; a model missing here shows «цена
// неизвестна» in the admin panel and is left out of the sums.

interface ModelPrice {
  /** Text and photos sent to the model. */
  input: number;
  /** What the model writes back; for an image model — the picture. */
  output: number;
  /** Draws pictures («Превью с ИИ») rather than filling in cards. */
  image?: boolean;
}

const PRICES: Record<string, ModelPrice> = {
  // gpt-5.6 without a tier is Sol. Its price is promotional until at least 21.11.2026.
  "gpt-5.6": { input: 4, output: 20 },
  "gpt-5.6-sol": { input: 4, output: 20 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Input at the photo rate ($8; the prompt text is $5): a little above the real bill, never below.
  "gpt-image-2.5-flare": { input: 8, output: 30, image: true }
};

/** Price by model name; "openai/gpt-5.6-luna" (OpenRouter) and snapshots like "gpt-5.6-luna-2026-08-01" count too. */
export function modelPrice(model: string): ModelPrice | null {
  const name = model.trim().toLowerCase().split("/").pop() ?? "";
  const base = name.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return PRICES[base] ?? null;
}

/** Dollars one request cost, or null for a model with no known price. */
export function requestCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = modelPrice(model);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Rubles you pay for $1 of AI («Настройки» → курс): the exchange rate plus a middleman's fee, if any. Null when not set. */
export function rublesPerDollar() {
  return settings().aiRubPerUsd;
}

/** Models with a known price, to pick from on «Настройки»: text ones fill in cards, image ones draw previews. */
export function knownModels() {
  const names = Object.keys(PRICES);
  return { text: names.filter((name) => !PRICES[name].image), image: names.filter((name) => PRICES[name].image) };
}
