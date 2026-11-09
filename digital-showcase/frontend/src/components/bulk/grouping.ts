import type { ProductStatus } from "../../types/models";
import { sortSizes } from "../../utils/format";
import { isValidPrice } from "../../utils/price";
import type { ProductPayload } from "../product-form";
import { ASK_SELLER } from "../product-form/helpers";
import { detailsFromDraft, simplePayload, type SimpleDetails } from "../product-form/simple";
import type { ProductDraft } from "../product-form/types";

// Bulk adding: the AI sorts photos into products, the owner fixes the sorting
// and sets prices. Everything here is plain data in, plain data out.

/** A chosen photo and the object URL of its preview. */
export interface BulkPhoto {
  file: File;
  url: string;
}

/**
 * One product-to-be. Price, sizes and colors are the form's «Одна цена»: the
 * price as typed («4500», «4 500 ₽», empty — asked from the seller), sizes and
 * colors with their swatches. Photos are indexes into the list of chosen photos.
 */
export interface BulkDraft extends SimpleDetails {
  id: string;
  title: string;
  description: string;
  category: string;
  status: ProductStatus;
  /** The first one is the cover. */
  photos: number[];
}

export interface Layout {
  drafts: BulkDraft[];
  /** Photos that belong to no product and won't be published. */
  unused: number[];
}

/** What the server returns for one product (see aiDraftService: BulkProductAiDraft). */
export type AiBulkDraft = ProductDraft & { imageIndexes: number[] };

/** A new product is in stock until the owner says otherwise. */
const DEFAULT_STATUS: ProductStatus = "AVAILABLE";

let nextId = 0;
const newId = () => `draft-${++nextId}`;

const colorKey = (name: string) => name.trim().toLowerCase().replace(/ё/g, "е");

function unique<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(key(item)) && seen.add(key(item)));
}

/** The AI's answer as an editable layout. Photos it left out or repeated are fixed here. */
export function layoutFromAi(drafts: AiBulkDraft[], photoCount: number): Layout {
  const taken = new Set<number>();
  const result = drafts
    .map((draft): BulkDraft => {
      const photos = draft.imageIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < photoCount && !taken.has(index) && taken.add(index));
      // Read as the form reads an AI draft: swatches by name or by the AI's code, «Уточнить у продавца» left out.
      const { price, sizes, colors } = detailsFromDraft(draft).simple;
      return {
        id: newId(),
        title: draft.title?.trim() ?? "",
        description: draft.description ?? "",
        category: draft.category ?? "",
        price,
        sizes,
        colors,
        status: DEFAULT_STATUS,
        photos
      };
    })
    .filter((draft) => draft.photos.length);
  const unused = Array.from({ length: photoCount }, (_, index) => index).filter((index) => !taken.has(index));
  return { drafts: result, unused };
}

function without(layout: Layout, photo: number): Layout {
  return {
    drafts: layout.drafts.map((draft) => (draft.photos.includes(photo) ? { ...draft, photos: draft.photos.filter((item) => item !== photo) } : draft)),
    unused: layout.unused.filter((item) => item !== photo)
  };
}

/** A product with no photos left has nothing to show: it goes away. */
function dropEmpty(layout: Layout): Layout {
  return { ...layout, drafts: layout.drafts.filter((draft) => draft.photos.length) };
}

export type PhotoTarget = { kind: "draft"; id: string } | { kind: "new" } | { kind: "unused" };

/** Moves a photo into another product, into a new product of its own, or out of all products. */
export function movePhoto(layout: Layout, photo: number, target: PhotoTarget): Layout {
  const cleared = without(layout, photo);
  if (target.kind === "unused") return dropEmpty({ ...cleared, unused: [...cleared.unused, photo] });
  if (target.kind === "new") {
    const draft: BulkDraft = { id: newId(), title: "", description: "", category: "", price: "", sizes: [], colors: [], status: DEFAULT_STATUS, photos: [photo] };
    return dropEmpty({ ...cleared, drafts: [...cleared.drafts, draft] });
  }
  if (!cleared.drafts.some((draft) => draft.id === target.id)) return layout;
  return dropEmpty({ ...cleared, drafts: cleared.drafts.map((draft) => (draft.id === target.id ? { ...draft, photos: [...draft.photos, photo] } : draft)) });
}

/** Puts a photo first in its product: the cover on the storefront. */
export function makeCover(layout: Layout, photo: number): Layout {
  return {
    ...layout,
    drafts: layout.drafts.map((draft) => (draft.photos.includes(photo) ? { ...draft, photos: [photo, ...draft.photos.filter((item) => item !== photo)] } : draft))
  };
}

/**
 * Two cards that are really one product (the AI split it). `keepId` keeps its
 * name and price and takes the other's photos, sizes and colors.
 */
export function mergeDrafts(layout: Layout, keepId: string, absorbId: string): Layout {
  const keep = layout.drafts.find((draft) => draft.id === keepId);
  const absorb = layout.drafts.find((draft) => draft.id === absorbId);
  if (!keep || !absorb || keep === absorb) return layout;
  const merged: BulkDraft = {
    ...keep,
    title: keep.title || absorb.title,
    description: keep.description || absorb.description,
    category: keep.category || absorb.category,
    price: keep.price || absorb.price,
    sizes: sortSizes(unique([...keep.sizes, ...absorb.sizes], (size) => size.toLowerCase())),
    colors: unique([...keep.colors, ...absorb.colors], (color) => colorKey(color.name)),
    photos: [...keep.photos, ...absorb.photos]
  };
  return { ...layout, drafts: layout.drafts.filter((draft) => draft.id !== absorbId).map((draft) => (draft.id === keepId ? merged : draft)) };
}

/** Removes a product; its photos stay available in «не используются». */
export function removeDraft(layout: Layout, id: string): Layout {
  const draft = layout.drafts.find((item) => item.id === id);
  if (!draft) return layout;
  return { drafts: layout.drafts.filter((item) => item.id !== id), unused: [...layout.unused, ...draft.photos] };
}

/** The same price for every product: «всё по 1500». */
export function withPriceForAll(layout: Layout, price: string): Layout {
  return { ...layout, drafts: layout.drafts.map((draft) => ({ ...draft, price })) };
}

export function isDraftValid(draft: BulkDraft) {
  return Boolean(draft.title.trim()) && isValidPrice(draft.price);
}

/** What goes to the product API: one price, so sizes and colors without combinations, as the form saves one price. */
export function toPayload(draft: BulkDraft): ProductPayload {
  const details = simplePayload(draft);
  return {
    ...details,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: draft.category.trim() || null,
    priceText: details.price == null ? ASK_SELLER : null,
    status: draft.status,
    isVisible: 1
  };
}
