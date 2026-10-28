import type { Product } from "../../types/models";
import { sortSizes } from "../../utils/format";
import { isValidPrice, parsePrice } from "../../utils/price";
import { ASK_SELLER, normalizeHex } from "./helpers";
import type { DetailsMode, ProductDraft, SavedProductFormDraft } from "./types";

/**
 * «Цена, размеры и цвета»: the ticked sizes and colors and the price — the
 * same whichever way the product is priced.
 *
 * One price for everything is stored as sizes and colors alone, without
 * combinations: buyers see them, there is nothing to pick. «Разные цены для
 * размеров и цветов» adds VariantPrices on top and is stored as color × size
 * combinations, which buyers pick from.
 */
export interface SimpleDetails {
  /** One price for everything; with different prices — the usual one, for combinations without their own. */
  price: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
}

/** «Разные цены»: what differs from the usual price, by combinationKey. */
export interface VariantPrices {
  /** A combination's own price; absent or empty — the usual price. */
  prices: Record<string, string>;
  /** Combinations that aren't sold, e.g. no XS in white. */
  missing: string[];
}

export const emptySimpleDetails: SimpleDetails = { price: "", sizes: [], colors: [] };
export const emptyVariantPrices: VariantPrices = { prices: {}, missing: [] };

export const LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
export const NUMBER_SIZES = ["40", "42", "44", "46", "48", "50", "52", "54", "56"];

export const NAMED_COLORS = [
  { name: "Чёрный", hex: "#1A1A1A" },
  { name: "Белый", hex: "#FFFFFF" },
  { name: "Серый", hex: "#9CA3AF" },
  { name: "Бежевый", hex: "#D6BB98" },
  { name: "Коричневый", hex: "#7C4A2D" },
  { name: "Красный", hex: "#DC2626" },
  { name: "Бордовый", hex: "#7F1D1D" },
  { name: "Розовый", hex: "#EC4899" },
  { name: "Оранжевый", hex: "#EA580C" },
  { name: "Жёлтый", hex: "#F59E0B" },
  { name: "Зелёный", hex: "#16A34A" },
  { name: "Хаки", hex: "#6B6B3A" },
  { name: "Голубой", hex: "#7DD3FC" },
  { name: "Синий", hex: "#2563EB" },
  { name: "Фиолетовый", hex: "#7C3AED" }
];

export const CATEGORY_PRESETS = ["Платья", "Верх", "Низ", "Верхняя одежда", "Обувь", "Аксессуары"];

const colorKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, "е");

/** Hex for a color name the AI or an old product used; neutral grey when unknown. */
export function hexForColorName(name: string, fallback?: string | null) {
  const named = NAMED_COLORS.find((color) => colorKey(color.name) === colorKey(name));
  if (named) return named.hex;
  return fallback ? normalizeHex(fallback) : "#9CA3AF";
}

function unique<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/** A color × size combination; one of them may be missing (only sizes or only colors are ticked). */
export interface Combination {
  key: string;
  color: { name: string; hex: string } | null;
  size: string | null;
}

export function combinationKey(colorName: string | null, size: string | null) {
  return `${colorName ? colorKey(colorName) : ""}|${size ?? ""}`;
}

/** Every combination of the ticked colors and sizes, color by color. */
export function combinations({ sizes, colors }: SimpleDetails): Combination[] {
  if (!sizes.length && !colors.length) return [];
  return (colors.length ? colors : [null]).flatMap((color) =>
    (sizes.length ? sizes : [null]).map((size) => ({ key: combinationKey(color?.name ?? null, size), color, size }))
  );
}

/** The usual price and every combination's own one are prices or empty. */
export function arePricesValid(simple: SimpleDetails, variantPrices: VariantPrices | null) {
  return isValidPrice(simple.price) && Object.values(variantPrices?.prices ?? {}).every(isValidPrice);
}

function priceOrNull(value: string) {
  const parsed = parsePrice(value.trim());
  return value.trim() && !Number.isNaN(parsed) ? parsed : null;
}

/** One price for everything: sizes and colors only — buyers see them and have nothing to pick. */
export function simplePayload(simple: SimpleDetails) {
  const colors = simple.colors.map((color) => ({ name: color.name, hex: color.hex || null }));
  return { price: priceOrNull(simple.price), priceText: null, sizes: simple.sizes, colors, variants: [] };
}

/**
 * Different prices: a combination for each color × size that is sold, at its
 * own price or the usual one. Without a ticked color or size its place is
 * «Уточнить у продавца», as the server needs both. Cards show «from» the
 * lowest price.
 */
export function variantPayload(simple: SimpleDetails, { prices, missing }: VariantPrices) {
  const notSold = new Set(missing);
  const variants = combinations(simple)
    .filter((combination) => !notSold.has(combination.key))
    .map(({ key, color, size }) => ({
      colorName: color?.name ?? ASK_SELLER,
      colorHex: color?.hex ?? null,
      size: size ?? ASK_SELLER,
      price: priceOrNull(prices[key]?.trim() || simple.price)
    }));
  const colors = simple.colors.map((color) => ({ name: color.name, hex: color.hex || null }));
  return { price: variants.length ? null : priceOrNull(simple.price), priceText: null, sizes: simple.sizes, colors, variants };
}

/** A combination as a saved product, an AI draft or an old form draft keeps it. */
export interface PriceRow {
  colorName: string;
  colorHex: string | null;
  size: string;
  price: string;
}

/**
 * Combinations → ticked sizes and colors, the usual price (the most common
 * one) and what differs from it. `isOnePrice` — a full grid at one price:
 * nothing differs, the product can be shown with one price.
 */
export function detailsFromRows(rows: PriceRow[], fallbackPrice = ""): { simple: SimpleDetails; variantPrices: VariantPrices; isOnePrice: boolean } {
  const known = (value: string) => value.trim() && value !== ASK_SELLER;
  const cleanRows = rows.map((row) => ({ ...row, price: known(row.price) ? row.price.trim() : "" })).filter((row) => known(row.colorName) || known(row.size));
  const sizes = sortSizes(unique(cleanRows.map((row) => row.size.trim()).filter(known), (size) => size));
  const colors = unique(
    cleanRows.filter((row) => known(row.colorName)).map((row) => ({ name: row.colorName.trim(), hex: hexForColorName(row.colorName, row.colorHex) })),
    (color) => colorKey(color.name)
  );
  const simpleWithoutPrice = { price: "", sizes, colors };

  const counts = new Map<string, number>();
  for (const row of cleanRows) if (row.price) counts.set(row.price, (counts.get(row.price) ?? 0) + 1);
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackPrice;

  const rowKey = (row: PriceRow) => combinationKey(known(row.colorName) ? row.colorName : null, known(row.size) ? row.size.trim() : null);
  const priceByKey = new Map(cleanRows.map((row) => [rowKey(row), row.price]));
  const prices: Record<string, string> = {};
  for (const [key, price] of priceByKey) if (price && price !== usual) prices[key] = price;
  const missing = combinations(simpleWithoutPrice)
    .map((combination) => combination.key)
    .filter((key) => !priceByKey.has(key));

  return {
    simple: { ...simpleWithoutPrice, price: usual },
    variantPrices: { prices, missing },
    isOnePrice: !Object.keys(prices).length && !missing.length
  };
}

/** How a product opens in the form: one price, or different ones with what differs. */
export function detailsFromProduct(product?: Product): { mode: DetailsMode; simple: SimpleDetails; variantPrices: VariantPrices } {
  if (!product) return { mode: "simple", simple: emptySimpleDetails, variantPrices: emptyVariantPrices };
  const price = product.price?.toString() ?? "";
  if (!product.variants.length) {
    return {
      mode: "simple",
      simple: {
        price,
        sizes: product.sizes.map((size) => size.value).filter((size) => size && size !== ASK_SELLER),
        colors: product.colors.filter((color) => color.name !== ASK_SELLER).map((color) => ({ name: color.name, hex: hexForColorName(color.name, color.hex) }))
      },
      variantPrices: emptyVariantPrices
    };
  }
  // Saved before one price stopped making combinations: a full grid at one price opens (and saves) as one price.
  const rows = product.variants.map((variant) => ({ ...variant, price: variant.price?.toString() ?? "" }));
  const details = detailsFromRows(rows, price);
  return { mode: details.isOnePrice ? "simple" : "advanced", simple: details.simple, variantPrices: details.variantPrices };
}

/** A form draft left unsaved, in the shape this form keeps it; null when it has no prices to restore. */
export function detailsFromSavedDraft(draft: SavedProductFormDraft | null): { mode: DetailsMode; simple: SimpleDetails; variantPrices: VariantPrices } | null {
  if (!draft) return null;
  // Saved before «Разные цены» became a switch: the combinations themselves.
  if (draft.mode === "advanced" && !draft.variantPrices && draft.variants?.length) {
    const details = detailsFromRows(draft.variants);
    return { mode: details.isOnePrice ? "simple" : "advanced", simple: details.simple, variantPrices: details.variantPrices };
  }
  if (!draft.simple) return null;
  return { mode: draft.mode ?? "simple", simple: draft.simple, variantPrices: draft.variantPrices ?? emptyVariantPrices };
}

/** What an AI draft says about price, sizes and colors; `isOnePrice` — it found no different prices. */
export function detailsFromDraft(draft: ProductDraft) {
  const rows = (draft.variants ?? [])
    .filter((variant) => variant.colorName !== ASK_SELLER && variant.size !== ASK_SELLER)
    .map((variant) => ({ ...variant, price: variant.price?.toString() ?? "" }));
  const draftPrice = draft.price?.toString() ?? "";
  if (rows.length) {
    const details = detailsFromRows(rows, draftPrice);
    if (details.simple.sizes.length || details.simple.colors.length) return details;
  }
  return {
    simple: {
      price: draftPrice,
      sizes: (draft.sizes ?? []).filter((size) => size && size !== ASK_SELLER),
      colors: (draft.colors ?? [])
        .filter((color) => color.name && color.name !== ASK_SELLER)
        .map((color) => ({ name: color.name, hex: hexForColorName(color.name, color.hex) }))
    },
    variantPrices: emptyVariantPrices,
    isOnePrice: true
  };
}
