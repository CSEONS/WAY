import type { ProductStatus } from "../../types/models";
import { isValidPrice, parsePrice } from "../../utils/price";
import type { ProductPayload } from "../product-form";
import { ASK_SELLER } from "../product-form/helpers";

// Bulk adding: the AI sorts photos into products, the owner fixes the sorting
// and sets prices. Everything here is plain data in, plain data out.

/** A chosen photo and the object URL of its preview. */
export interface BulkPhoto {
  file: File;
  url: string;
}

/** One product-to-be. Photos are indexes into the list of chosen photos. */
export interface BulkDraft {
  id: string;
  title: string;
  description: string;
  category: string;
  /** As typed: «4500», «4 500 ₽». Empty — the price is asked from the seller. */
  price: string;
  status: ProductStatus;
  /** Comma-separated, as typed. */
  sizes: string;
  colors: string;
  /** Swatches the AI found, by lower-cased color name. */
  colorHex: Record<string, string | null>;
  /** The first one is the cover. */
  photos: number[];
}

export interface Layout {
  drafts: BulkDraft[];
  /** Photos that belong to no product and won't be published. */
  unused: number[];
}

/** What the server returns for one product (see aiDraftService: BulkProductAiDraft). */
export interface AiBulkDraft {
  title: string;
  description: string | null;
  price: number | null;
  category: string | null;
  status: ProductStatus;
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  imageIndexes: number[];
}

let nextId = 0;
const newId = () => `draft-${++nextId}`;

function list(text: string) {
  return [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))];
}

function union(a: string, b: string) {
  const seen = new Set<string>();
  return [...list(a), ...list(b)].filter((item) => !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase())).join(", ");
}

/** The AI's answer as an editable layout. Photos it left out or repeated are fixed here. */
export function layoutFromAi(drafts: AiBulkDraft[], photoCount: number): Layout {
  const taken = new Set<number>();
  const result = drafts
    .map((draft): BulkDraft => {
      const photos = draft.imageIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < photoCount && !taken.has(index) && taken.add(index));
      return {
        id: newId(),
        title: draft.title?.trim() ?? "",
        description: draft.description ?? "",
        category: draft.category ?? "",
        price: draft.price != null ? String(draft.price) : "",
        status: draft.status,
        // The server writes «Уточнить у продавца» as a size when it found none.
        sizes: draft.sizes.filter((size) => size !== ASK_SELLER).join(", "),
        colors: draft.colors.map((color) => color.name).filter(Boolean).join(", "),
        colorHex: Object.fromEntries(draft.colors.map((color) => [color.name.toLowerCase(), color.hex])),
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
    const draft: BulkDraft = { id: newId(), title: "", description: "", category: "", price: "", status: "CHECK_IN_STORE", sizes: "", colors: "", colorHex: {}, photos: [photo] };
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
    sizes: union(keep.sizes, absorb.sizes),
    colors: union(keep.colors, absorb.colors),
    colorHex: { ...absorb.colorHex, ...keep.colorHex },
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

/** A typed price also settles availability, unless the owner picked «нет в наличии». */
export function withPrice(draft: BulkDraft, price: string): BulkDraft {
  const had = draft.price.trim() !== "";
  const has = price.trim() !== "";
  let status = draft.status;
  if (!had && has && status === "CHECK_IN_STORE") status = "AVAILABLE";
  if (had && !has && status === "AVAILABLE") status = "CHECK_IN_STORE";
  return { ...draft, price, status };
}

/** The same price for every product: «всё по 1500». */
export function withPriceForAll(layout: Layout, price: string): Layout {
  return { ...layout, drafts: layout.drafts.map((draft) => withPrice(draft, price)) };
}

export function isDraftValid(draft: BulkDraft) {
  return Boolean(draft.title.trim()) && isValidPrice(draft.price);
}

/** What goes to the product API: one price, so sizes and colors without combinations, like the form's one price. */
export function toPayload(draft: BulkDraft): ProductPayload {
  const price = isValidPrice(draft.price) ? parsePrice(draft.price) : null;
  const sizes = list(draft.sizes);
  const colors = list(draft.colors).map((name) => ({ name, hex: draft.colorHex[name.toLowerCase()] ?? null }));
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: draft.category.trim() || null,
    price,
    priceText: price == null ? ASK_SELLER : null,
    status: draft.status,
    isVisible: 1,
    sizes,
    colors,
    variants: []
  };
}
