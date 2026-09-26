import type { Product } from "../../types/models";
import type { Tone } from "../../ui";

export const availabilityLabels: Record<Product["status"], string> = {
  AVAILABLE: "В наличии",
  CHECK_IN_STORE: "Уточнять в магазине",
  NOT_AVAILABLE: "Нет в наличии"
};

export const availabilityTones: Record<Product["status"], Tone> = {
  AVAILABLE: "success",
  CHECK_IN_STORE: "accent",
  NOT_AVAILABLE: "danger"
};

export function formatRub(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

/** The price an owner sees in the list: text, own price, or «from» the cheapest variant. */
export function productPrice(product: Product) {
  if (product.priceText) return product.priceText;
  if (product.price != null) return formatRub(product.price);
  const prices = product.variants.map((variant) => variant.price).filter((price): price is number => price != null);
  if (!prices.length) return "Цена в магазине";
  const min = Math.min(...prices);
  return prices.some((price) => price !== min) ? `от ${formatRub(min)}` : formatRub(min);
}

/** Distinct variant prices, e.g. to warn that a quick price change flattens them. */
export function variantPriceRange(product: Product) {
  const prices = [...new Set(product.variants.map((variant) => variant.price).filter((price): price is number => price != null))];
  if (prices.length < 2) return null;
  return `${formatRub(Math.min(...prices))} – ${formatRub(Math.max(...prices))}`;
}
