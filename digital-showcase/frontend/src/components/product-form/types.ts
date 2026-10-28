import type { ImageModeration, ProductStatus } from "../../types/models";
import type { SimpleDetails } from "./simple";

export interface VariantFormRow {
  id: string;
  colorName: string;
  colorHex: string;
  size: string;
  price: string;
}

export interface ColorHistoryItem {
  name: string;
  hex: string;
}

export type VariantModalType = "color" | "size" | "price" | "all-colors" | "all-sizes" | "all-prices";

export interface ProductFormState {
  title: string;
  description: string;
  category: string;
  status: ProductStatus;
  isVisible: number;
}

export type DetailsMode = "simple" | "advanced";

export interface SavedProductFormDraft {
  form: ProductFormState;
  variants: VariantFormRow[];
  /** Absent in drafts saved before the simple form existed. */
  mode?: DetailsMode;
  simple?: SimpleDetails;
}

export interface ProductPayload {
  title: string;
  description: string | null;
  price: number | null;
  priceText: string | null;
  category: string | null;
  status: ProductStatus;
  isVisible: number;
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  variants: { colorName: string; colorHex: string | null; size: string; price: number | null }[];
}

/** What the AI endpoint returns: the same shape as the payload. */
export type ProductDraft = ProductPayload;

export interface ProductFormImage {
  id: string;
  existingId: string | null;
  file: File | null;
  name: string;
  url: string;
  /** A saved photo with people or animals on it: on moderation or hidden. */
  moderation?: ImageModeration | null;
  /** A new cover from «Превью с ИИ» with people or animals on it: sent with the upload, the product goes to moderation. */
  livingBeings?: string[];
}

export interface ProductImageSelection {
  images: ProductFormImage[];
  previewImageId: string | null;
  /** «Превью с ИИ» was still drawing when the owner saved: the save waits for it (backgroundJobs). */
  pendingPreview?: PendingPreview;
}

/** A picture «Превью с ИИ» drew, with who is on it (for moderation). */
export interface DrawnPicture {
  file: File;
  livingBeings: string[];
}

export interface PendingPreview {
  /** Null — the drawing failed: the product stays as it was saved. */
  picture: Promise<DrawnPicture | null>;
  /** The form photo it takes the place of — a preview drawn before it — as it would have in the form. */
  replaces: string | null;
}
