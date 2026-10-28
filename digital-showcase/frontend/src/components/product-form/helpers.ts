import type { Product } from "../../types/models";
import type { ProductFormImage, SavedProductFormDraft } from "./types";

export const ASK_SELLER = "Уточнить у продавца";

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

export function normalizeSize(value: string): string {
  return value.trim().toUpperCase();
}

export function combinationsLabel(count: number) {
  if (!count) return "";
  return `${count} ${count === 1 ? "комбинация" : count < 5 ? "комбинации" : "комбинаций"}`;
}

export function initialImages(initial?: Product): ProductFormImage[] {
  return (
    initial?.images.map((image) => ({
      id: image.id,
      existingId: image.id,
      file: null,
      name: "Картинка товара",
      url: image.url,
      moderation: image.moderation ?? null
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

export function hasDraftContent(draft: SavedProductFormDraft) {
  return (
    draft.form.title.trim() ||
    draft.form.description.trim() ||
    draft.form.category.trim() ||
    draft.simple?.price.trim() ||
    draft.simple?.sizes.length ||
    draft.simple?.colors.length ||
    Object.values(draft.variantPrices?.prices ?? {}).some((price) => price.trim())
  );
}
