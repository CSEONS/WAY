export type Role = "ADMIN" | "OWNER";
export type ProductStatus = "AVAILABLE" | "NOT_AVAILABLE" | "CHECK_IN_STORE";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: Role;
  /** Last time the owner opened the app (not counting an admin signed in as them). */
  lastSeenAt: string | null;
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
  /** «@name» or a link; with vk — where the owner shares their products. */
  instagram: string | null;
  vk: string | null;
  logoUrl: string | null;
  /** Free text, e.g. «Пн–Сб 10:00–19:00». */
  workingHours: string | null;
  isActive: number;
  /** The store's plan («Тарифы и цены»). */
  planId: string | null;
  /** AI helper on: a copy of the plan's aiEnabled, kept by planService. */
  aiFormEnabled: number;
  subscriptionEndsAt: string | null;
  /** AI cards per calendar month; null — the plan's limit. */
  aiMonthlyLimit: number | null;
  /** AI previews and AI cards bought in packages and not spent yet; they don't burn at the month's end. */
  extraPreviews: number;
  extraFills: number;
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
  /** For the owner only: the photo shows living beings and waits for moderation or was rejected. */
  moderation?: { status: "PENDING" | "APPROVED" | "REJECTED"; findings: string } | null;
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

export type LeadStatus = "NEW" | "DONE";

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

export interface JwtPayload {
  userId: string;
  role: Role;
  /** Set when an admin signed in as this owner («Войти как владелец»). */
  impersonatedBy?: string;
}

export type PaymentMethod = "CASH" | "TRANSFER" | "OTHER";

export interface Payment {
  id: string;
  storeId: string;
  storeName: string;
  /** Rubles. 0 — a free extension. */
  amount: number;
  months: number;
  method: PaymentMethod;
  comment: string | null;
  /** Subscription end before this payment (null — there was none, or it's a package). */
  periodStart: string | null;
  /** Subscription end after this payment; null for a package — it extends nothing. */
  periodEnd: string | null;
  /** A package sale: its name. Then months is 0. Null — a subscription extension. */
  packageName: string | null;
  createdBy: string | null;
  /** Receipt link («Мой налог») or number; null — not issued yet. */
  receipt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  details: string | null;
  createdAt: string;
}
