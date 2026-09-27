/**
 * A price as people type it: «1 500», «1500 ₽», «1 500,50 руб.» → 1500 / 1500.5.
 * Empty → null (no price). Anything else → NaN, so the form can say so
 * instead of silently dropping the price.
 */
export function parsePrice(text: string): number | null {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/руб\.?|р\.?|₽/g, "")
    .replace(/[\s ]/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 ? amount : Number.NaN;
}

export function isValidPrice(text: string) {
  return !Number.isNaN(parsePrice(text));
}

export const PRICE_ERROR = "Введите число, например 2500";
