import type { Product } from "../../types/models";
import { ASK_SELLER, createId, initialVariants, normalizeHex } from "./helpers";
import type { ProductDraft, VariantFormRow } from "./types";

/**
 * The simple form: one price per product plus ticked sizes and colors.
 * Stored as the same color × size variants with one price, so a product can
 * be opened in the advanced (per-variant) form at any time.
 */
export interface SimpleDetails {
  price: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
}

export const emptySimpleDetails: SimpleDetails = { price: "", sizes: [], colors: [] };

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

/** Rows fit the simple form when they are a full color × size grid with one price and no «Уточнить у продавца». */
export function variantsToSimple(rows: VariantFormRow[]): SimpleDetails | null {
  const cleanRows = rows.filter((row) => row.colorName.trim() || row.size.trim());
  if (!cleanRows.length) return { ...emptySimpleDetails };
  if (cleanRows.some((row) => row.colorName === ASK_SELLER || row.size === ASK_SELLER || row.price === ASK_SELLER)) return null;

  const prices = unique(cleanRows.map((row) => row.price.trim()), (price) => price);
  if (prices.length > 1) return null;

  const colors = unique(
    cleanRows.map((row) => ({ name: row.colorName.trim(), hex: hexForColorName(row.colorName, row.colorHex) })),
    (color) => colorKey(color.name)
  ).filter((color) => color.name);
  const sizes = unique(cleanRows.map((row) => row.size.trim()), (size) => size).filter(Boolean);
  const isFullGrid =
    colors.length * sizes.length === cleanRows.length &&
    colors.every((color) => sizes.every((size) => cleanRows.some((row) => colorKey(row.colorName) === colorKey(color.name) && row.size.trim() === size)));
  if (!isFullGrid) return null;

  return { price: prices[0] ?? "", sizes, colors };
}

/** Initial simple details of a product, or null when it needs the advanced (per-variant) form. */
export function simpleFromProduct(product?: Product): SimpleDetails | null {
  if (!product) return { ...emptySimpleDetails };
  if (!product.variants.length) {
    return {
      price: product.price?.toString() ?? "",
      sizes: product.sizes.map((size) => size.value).filter((size) => size && size !== ASK_SELLER),
      colors: product.colors.filter((color) => color.name !== ASK_SELLER).map((color) => ({ name: color.name, hex: hexForColorName(color.name, color.hex) }))
    };
  }
  return variantsToSimple(initialVariants(product));
}

/** Simple details → rows of the advanced builder (when the owner asks for different prices). */
export function simpleToVariantRows(simple: SimpleDetails): VariantFormRow[] {
  const colors = simple.colors.length ? simple.colors : [{ name: ASK_SELLER, hex: "" }];
  const sizes = simple.sizes.length ? simple.sizes : [ASK_SELLER];
  if (!simple.colors.length && !simple.sizes.length) return [];
  return colors.flatMap((color) =>
    sizes.map((size) => ({ id: createId(), colorName: color.name, colorHex: color.hex, size, price: simple.price.trim() }))
  );
}

/** Advanced rows → simple details, even when that means one price for all (the owner confirms the loss). */
export function simplifyVariantRows(rows: VariantFormRow[]): SimpleDetails {
  const exact = variantsToSimple(rows);
  if (exact) return exact;
  const price = rows.map((row) => row.price.trim()).find((value) => value && value !== ASK_SELLER) ?? "";
  return {
    price,
    sizes: unique(rows.map((row) => row.size.trim()), (size) => size).filter((size) => size && size !== ASK_SELLER),
    colors: unique(
      rows.filter((row) => row.colorName.trim() && row.colorName !== ASK_SELLER).map((row) => ({ name: row.colorName.trim(), hex: hexForColorName(row.colorName, row.colorHex) })),
      (color) => colorKey(color.name)
    )
  };
}

/** Simple details from an AI draft, or null when the draft has really different prices per variant. */
export function simpleFromDraft(draft: ProductDraft): SimpleDetails | null {
  if (draft.variants?.length) {
    const rows = draft.variants.map((variant) => ({
      id: createId(),
      colorName: variant.colorName,
      colorHex: variant.colorHex ?? "",
      size: variant.size,
      price: variant.price?.toString() ?? ""
    }));
    const fromRows = variantsToSimple(rows.filter((row) => row.colorName !== ASK_SELLER && row.size !== ASK_SELLER));
    if (!fromRows) return null;
    if (fromRows.sizes.length || fromRows.colors.length) return { ...fromRows, price: fromRows.price || (draft.price?.toString() ?? "") };
  }
  return {
    price: draft.price?.toString() ?? "",
    sizes: (draft.sizes ?? []).filter((size) => size && size !== ASK_SELLER),
    colors: (draft.colors ?? [])
      .filter((color) => color.name && color.name !== ASK_SELLER)
      .map((color) => ({ name: color.name, hex: hexForColorName(color.name, color.hex) }))
  };
}

/** What the API gets for a simple product: one price; variants only when both colors and sizes are set. */
export function simplePayload(simple: SimpleDetails) {
  const price = simple.price.trim() ? Number(simple.price) : null;
  const colors = simple.colors.map((color) => ({ name: color.name, hex: color.hex || null }));
  const variants =
    colors.length && simple.sizes.length
      ? colors.flatMap((color) => simple.sizes.map((size) => ({ colorName: color.name, colorHex: color.hex, size, price })))
      : [];
  return { price, priceText: null, sizes: simple.sizes, colors, variants };
}
