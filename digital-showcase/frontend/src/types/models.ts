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
  /** The store's plan («Тарифы и цены»). */
  planId: string | null;
  /** AI helper on: follows the plan. */
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

export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

/** A photo where the AI found people or animals: waits for moderation (hidden from buyers), shown or hidden for good. */
export interface ImageModeration {
  status: ModerationStatus;
  /** What was found, e.g. «лицо человека, кот на принте». */
  findings: string;
}

export interface ProductImage {
  id: string;
  url: string;
  sortOrder: number;
  /** Only in the owner's own view. */
  moderation?: ImageModeration | null;
}

/** GET /moderation/images — a photo or logo for the moderator. */
export interface ImageCheck {
  id: string;
  url: string;
  kind: "PRODUCT" | "LOGO";
  status: ModerationStatus;
  findings: string;
  createdAt: string;
  reviewedAt: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  productId: string | null;
  productTitle: string | null;
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
  /** The store's plan; null if it has none. */
  plan: { name: string; price: number | null; aiEnabled: boolean; aiMonthlyLimit: number | null } | null;
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
  planId: string | null;
  planName: string | null;
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
  /** Photos with living beings waiting for moderation: buyers don't see them until then. */
  moderationPending: number;
  /** The last copy failed, or there has been none for over a day. */
  backupProblem: { kind: "failed" | "stale"; at: string | null; error: string | null } | null;
  inactiveDays: number;
}

/** What a plan card shows. */
export interface Plan {
  name: string;
  /** Rubles a month; null — «Цена по запросу». */
  price: number | null;
  description: string;
  features: string[];
}

/** A plan on the landing (GET /public/site). */
export interface PublicPlan extends Plan {
  id: string;
  /** The plan most people should pick: accented. */
  highlighted: boolean;
  /** «До N карточек с ИИ в месяц»; null — no AI. */
  aiMonthlyLimit: number | null;
}

/** GET /admin/plans — a plan with what it unlocks and how many stores are on it. */
export interface AdminPlan extends Plan {
  id: string;
  aiEnabled: number;
  aiMonthlyLimit: number | null;
  highlighted: number;
  /** Shown on the landing; a hidden plan still works for its stores. */
  isPublic: number;
  sortOrder: number;
  storeCount: number;
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
  /** Plans shown on the landing, in order. */
  plans: PublicPlan[];
  /** «Посмотреть пример» on the landing; empty — no button. */
  demoStoreSlug: string;
  /** «Написать нам» on the landing. */
  salesContacts: { whatsapp: string; phone: string };
  helpVideos: HelpVideo[];
  legal: Legal;
}

export type PreviewQuality = "low" | "medium" | "high";

/** A free period: so many days or calendar months. */
export interface TrialPeriod {
  count: number;
  unit: "days" | "months";
}

/** GET/PUT /admin/settings — contacts, videos, requisites, the trial, AI. Plans are separate (/admin/plans). */
export interface Settings extends Omit<SiteSettings, "plans"> {
  /** Who owners write or call: «Помощь» and «Подписка и итоги». */
  support: { whatsapp: string; phone: string; telegram: string };
  trial: TrialPeriod;
  aiPreviewUnits: number;
  aiModel: string;
  aiPreviewEnabled: boolean;
  aiPreviewModel: string;
  aiPreviewQuality: PreviewQuality;
  aiRubPerUsd: number | null;
}

/** GET /admin/ai/spend — «Расходы на ИИ». Ruble sums are null until the rate is set on «Настройки». */
export interface AiSpendReport {
  rubPerUsd: number | null;
  /** The last six months, oldest first; months without AI are there too. */
  months: { month: string; cards: number; previews: number; costRub: number | null }[];
  /** This month by store, most expensive first. `used` counts previews too, like the limit. */
  stores: { storeId: string; name: string; cards: number; previews: number; used: number; limit: number; costRub: number | null }[];
  unpricedModels: string[];
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
