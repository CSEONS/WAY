export type Role = "ADMIN" | "OWNER";
export type ProductStatus = "AVAILABLE" | "NOT_AVAILABLE" | "CHECK_IN_STORE";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  lastSeenAt?: string | null;
  /** Set when an admin is signed in as this owner. */
  impersonatedBy?: { id: string; name: string };
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
  /** AI cards per month; null — the server default. */
  aiMonthlyLimit?: number | null;
  /** Computed by the server for the owner and admin panels. */
  subscription?: SubscriptionInfo;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionState = "unlimited" | "active" | "expiring" | "grace" | "expired" | "disabled";

export interface SubscriptionInfo {
  state: SubscriptionState;
  endsAt: string | null;
  /** When the storefront actually closes (endsAt + grace days). */
  graceEndsAt: string | null;
  /** Whole days until endsAt; negative once it has passed. */
  daysLeft: number | null;
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

export type PaymentMethod = "CASH" | "TRANSFER" | "OTHER";

export interface Payment {
  id: string;
  storeId: string;
  storeName: string;
  amount: number;
  months: number;
  method: PaymentMethod;
  comment: string | null;
  periodStart: string | null;
  periodEnd: string;
  createdBy: string | null;
  createdAt: string;
}

export interface MonthRevenue {
  /** "YYYY-MM". */
  month: string;
  total: number;
  count: number;
}

export interface MonthReport {
  month: string;
  storeViews: number;
  productViews: number;
  contactClicks: number;
  contactsByChannel: { whatsapp: number; telegram: number; phone: number };
  newProducts: number;
  topProducts: { id: string; title: string; views: number }[];
}

export interface AiStatus {
  enabled: boolean;
  used: number;
  limit: number;
}

export interface SupportContacts {
  whatsapp: string | null;
  phone: string | null;
  telegram: string | null;
}

/** GET /owner/stores/:id/subscription */
export interface OwnerSubscription {
  subscription: SubscriptionInfo;
  graceDays: number;
  ai: AiStatus;
  payments: Pick<Payment, "id" | "amount" | "months" | "method" | "periodEnd" | "createdAt">[];
  reports: MonthReport[];
  support: SupportContacts;
}

/** One store in the admin overview. */
export interface OverviewStore {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerLastSeenAt: string | null;
  isActive: number;
  aiFormEnabled: number;
  subscriptionEndsAt: string | null;
  subscription: SubscriptionInfo;
  productCount: number;
  visibleProductCount: number;
  ai: { used: number; limit: number };
  contactsThisMonth: number;
}

/** GET /admin/overview */
export interface AdminOverview {
  stores: OverviewStore[];
  expiring: OverviewStore[];
  overdue: OverviewStore[];
  inactive: OverviewStore[];
  revenue: { byMonth: MonthRevenue[]; thisMonth: number };
  ai: { cards: number; inputTokens: number; outputTokens: number; costRub: number | null };
  newLeads: number;
  inactiveDays: number;
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
