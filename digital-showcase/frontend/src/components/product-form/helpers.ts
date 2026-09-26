import type { Product } from "../../types/models";
import type { ColorHistoryItem, ProductFormImage, SavedProductFormDraft, VariantFormRow } from "./types";

export const ASK_SELLER = "Уточнить у продавца";
export const LONG_PRESS_MS = 550;

export const COLOR_PRESETS = ["#1A1A1A", "#FFFFFF", "#DC2626", "#EA580C", "#F59E0B", "#16A34A", "#2563EB", "#7C3AED", "#EC4899", "#78716C"];

export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeHex(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "#2779A7";
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : "#2779A7";
}

export function isValidHex(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash);
}

export function normalizeSize(value: string): string {
  return value.trim().toUpperCase();
}

export function formatPrice(value: string): string {
  if (value === ASK_SELLER) return ASK_SELLER;
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("ru-RU")} ₽` : `${value} ₽`;
}

export function combinationsLabel(count: number) {
  if (!count) return "";
  return `${count} ${count === 1 ? "комбинация" : count < 5 ? "комбинации" : "комбинаций"}`;
}

export function uniqueColorHistory(source: VariantFormRow[]): ColorHistoryItem[] {
  const map = new Map<string, ColorHistoryItem>();
  for (const variant of source) {
    const name = variant.colorName.trim();
    if (!name || name === ASK_SELLER) continue;
    const hex = normalizeHex(variant.colorHex);
    if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), { name, hex });
  }

  return [...map.values()];
}

export function initialVariants(initial?: Product): VariantFormRow[] {
  if (initial?.variants.length) {
    return initial.variants.map((variant) => ({
      id: variant.id,
      colorName: variant.colorName,
      colorHex: variant.colorHex ?? "#2779a7",
      size: variant.size,
      price: variant.price?.toString() ?? ""
    }));
  }

  if (initial?.sizes.length || initial?.colors.length) {
    const sizes = initial.sizes.length ? initial.sizes : [{ id: "default-size", value: "" }];
    const colors = initial.colors.length ? initial.colors : [{ id: "default-color", name: "", hex: null }];
    return colors.flatMap((color) =>
      sizes.map((size) => ({
        id: createId(),
        colorName: color.name,
        colorHex: color.hex ?? "#2779a7",
        size: size.value,
        price: initial.price?.toString() ?? ""
      }))
    );
  }

  return [];
}

export function initialColorHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): ColorHistoryItem[] {
  const fromDraft = savedDraft?.variants?.length ? savedDraft.variants : [];
  const merged = uniqueColorHistory([...fromDraft, ...initialVariants(initial)]);
  return merged.length
    ? merged
    : [
        { name: "#1A1A1A", hex: "#1A1A1A" },
        { name: "#E5533D", hex: "#E5533D" },
        { name: "#2D8CF0", hex: "#2D8CF0" },
        { name: "#16A34A", hex: "#16A34A" }
      ];
}

export function initialSizeHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): string[] {
  const values = [...(savedDraft?.variants ?? []), ...initialVariants(initial)]
    .filter((variant) => variant.size.trim() && variant.size.trim() !== ASK_SELLER)
    .map((variant) => normalizeSize(variant.size));
  const unique = [...new Set(values)];
  return unique.length ? unique : ["S", "M", "L", "XL"];
}

export function initialPriceHistory(initial?: Product, savedDraft?: SavedProductFormDraft | null): string[] {
  const values = [...(savedDraft?.variants ?? []), ...initialVariants(initial)]
    .map((variant) => variant.price.trim())
    .filter((price) => price && price !== ASK_SELLER);
  if (initial?.price != null) values.unshift(String(initial.price));
  const unique = [...new Set(values)];
  return unique.length ? unique : ["990", "1990", "2990"];
}

export function initialImages(initial?: Product): ProductFormImage[] {
  return (
    initial?.images.map((image) => ({
      id: image.id,
      existingId: image.id,
      file: null,
      name: "Картинка товара",
      url: image.url
    })) ?? []
  );
}

export function readSavedDraft(draftKey?: string): SavedProductFormDraft | null {
  if (!draftKey) return null;
  try {
    const value = localStorage.getItem(draftKey);
    return value ? (JSON.parse(value) as SavedProductFormDraft) : null;
  } catch {
    return null;
  }
}

export function readStoredList<T>(key?: string): T[] | null {
  if (!key) return null;
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function hasDraftContent(draft: SavedProductFormDraft) {
  return (
    draft.form.title.trim() ||
    draft.form.description.trim() ||
    draft.form.category.trim() ||
    draft.aiPrompt.trim() ||
    draft.simple?.price.trim() ||
    draft.simple?.sizes.length ||
    draft.simple?.colors.length ||
    draft.variants.some((variant) => variant.colorName.trim() || variant.size.trim() || variant.price.trim())
  );
}
