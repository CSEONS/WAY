export type Role = "ADMIN" | "OWNER";
export type ProductStatus = "AVAILABLE" | "NOT_AVAILABLE" | "CHECK_IN_STORE";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  isActive: number;
  aiFormEnabled: number;
  subscriptionEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface ProductImage {
  id: string;
  productId: string;
  url: string;
  sortOrder: number;
  createdAt: string;
}

export interface ProductSize {
  id: string;
  productId: string;
  value: string;
}

export interface ProductColor {
  id: string;
  productId: string;
  name: string;
  hex: string | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  colorName: string;
  colorHex: string | null;
  size: string;
  price: number | null;
}

export interface ProductFull extends Product {
  images: ProductImage[];
  sizes: ProductSize[];
  colors: ProductColor[];
  variants: ProductVariant[];
}

export interface JwtPayload {
  userId: string;
  role: Role;
}
