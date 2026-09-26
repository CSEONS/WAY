export type Role = "ADMIN" | "OWNER";
export type ProductStatus = "AVAILABLE" | "NOT_AVAILABLE" | "CHECK_IN_STORE";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
}

export interface Store {
  id: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  logoUrl: string | null;
  /** Free text, e.g. «Ежедневно 10:00–20:00». */
  workingHours: string | null;
  isActive: number;
  aiFormEnabled: number;
  subscriptionEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  url: string;
  sortOrder: number;
}

export interface ProductSize {
  id: string;
  value: string;
}

export interface ProductColor {
  id: string;
  name: string;
  hex: string | null;
}

export interface ProductVariant {
  id: string;
  colorName: string;
  colorHex: string | null;
  size: string;
  price: number | null;
}

export interface Product {
  id: string;
  storeId: string;
  title: string;
  description: string | null;
  price: number | null;
  priceText: string | null;
  category: string | null;
  status: ProductStatus;
  isVisible: number;
  createdAt: string;
  updatedAt: string;
  images: ProductImage[];
  sizes: ProductSize[];
  colors: ProductColor[];
  variants: ProductVariant[];
}

/** What a storefront can be filtered by, across all its visible products. */
export interface StoreFacets {
  categories: string[];
  sizes: string[];
  colors: { name: string; hex: string | null }[];
}

export type LeadStatus = "NEW" | "DONE";

/** A request from the landing page form. */
export interface Lead {
  id: string;
  name: string;
  phone: string;
  storeName: string | null;
  city: string | null;
  comment: string | null;
  status: LeadStatus;
  createdAt: string;
}
