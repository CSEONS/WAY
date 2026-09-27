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
  logoUrl: string | null;
  /** Free text, e.g. «Пн–Сб 10:00–19:00». */
  workingHours: string | null;
  isActive: number;
  aiFormEnabled: number;
  subscriptionEndsAt: string | null;
  /** AI cards per calendar month; null — the AI_MONTHLY_LIMIT default. */
  aiMonthlyLimit: number | null;
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
  /** Subscription end before this payment (null — there was none). */
  periodStart: string | null;
  /** Subscription end after this payment. */
  periodEnd: string;
  createdBy: string | null;
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
