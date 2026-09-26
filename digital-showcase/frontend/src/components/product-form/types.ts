import type { ProductStatus } from "../../types/models";
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
  aiPrompt: string;
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
}

export interface ProductImageSelection {
  images: ProductFormImage[];
  previewImageId: string | null;
}
