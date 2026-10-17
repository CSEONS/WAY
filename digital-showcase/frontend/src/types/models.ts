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
  /** GET /owner/stores/:id only: the server draws «Превью с ИИ». */
  aiPreviewEnabled?: boolean;
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
  /** Receipt link («Мой налог») or number. */
  receipt: string | null;
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
  payments: Pick<Payment, "id" | "amount" | "months" | "method" | "periodEnd" | "receipt" | "createdAt">[];
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
  ai: AiSpend;
  newLeads: number;
  /** The newest of the new requests, for the top of the page. */
  latestLeads: Lead[];
  /** The last copy failed, or there has been none for over a day. */
  backupProblem: { kind: "failed" | "stale"; at: string | null; error: string | null } | null;
  inactiveDays: number;
}

export interface Plan {
  name: string;
  /** Rubles a month; null — «Цена по запросу». */
  price: number | null;
  description: string;
  features: string[];
}

export interface HelpVideo {
  title: string;
  url: string;
}

/** Who runs the service: the offer and the privacy policy (/offer, /privacy). */
export interface Legal {
  operator: string;
  /** Self-employed (НПД) / sole trader / company. */
  taxStatus: string;
  inn: string;
  /** ОГРНИП or ОГРН; empty for the self-employed. */
  ogrn: string;
  email: string;
  phone: string;
  address: string;
  /** Date of this version of both documents, YYYY-MM-DD. */
  updatedAt: string;
  /** After the paid date, how long a store's data is kept before deletion. */
  keepDataDays: number;
}

/** GET /public/site — the part of «Настройки» any visitor sees. */
export interface SiteSettings {
  /** «Витрина» and «Витрина + ИИ» — the two plans a store can be on. */
  plans: { basic: Plan; ai: Plan };
  /** AI cards a month on «Витрина + ИИ». */
  aiMonthlyLimit: number;
  /** «Посмотреть пример» on the landing; empty — no button. */
  demoStoreSlug: string;
  /** «Написать нам» on the landing. */
  salesContacts: { whatsapp: string; phone: string };
  helpVideos: HelpVideo[];
  legal: Legal;
}

export type PreviewQuality = "low" | "medium" | "high";

/** GET/PUT /admin/settings — everything on «Настройки». */
export interface Settings extends SiteSettings {
  /** Who owners write or call: «Помощь» and «Подписка и итоги». */
  support: { whatsapp: string; phone: string; telegram: string };
  trialDays: number;
  aiPreviewUnits: number;
  aiModel: string;
  aiPreviewEnabled: boolean;
  aiPreviewModel: string;
  aiPreviewQuality: PreviewQuality;
  aiRubPerUsd: number | null;
}

/** This month's AI, in cards and rubles. Ruble sums are null until the rate is set on «Настройки». */
export interface AiSpend {
  /** Cards used by all stores; previews are part of them too. */
  cards: number;
  /** «Превью с ИИ» pictures. */
  previews: number;
  costRub: number | null;
  /** An average card: a draft or one product of a bulk upload. */
  cardRub: number | null;
  previewRub: number | null;
  /** The dearest preview of the month. */
  previewMaxRub: number | null;
  rubPerUsd: number | null;
  /** Models with no known price: their requests aren't in the sums. */
  unpricedModels: string[];
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
