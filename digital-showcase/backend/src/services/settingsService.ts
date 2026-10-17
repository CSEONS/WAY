import { rawDb } from "../database/db.js";

// What the admin changes on «Настройки» without touching files: plans and
// prices, contacts, requisites, help videos, the trial, AI limits and models.
// These used to live in .env and in frontend config files. The old .env values
// (TRIAL_DAYS, AI_MODEL, SUPPORT_*, …) are still the starting point until the
// admin saves. Secrets and infrastructure — keys, provider addresses, the
// domain, backups — stay in .env.

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
  /** «Иванов Иван Иванович», «ИП Иванов Иван Иванович» or «ООО „Витрины“». */
  operator: string;
  /** Self-employed (НПД) / sole trader / company. */
  taxStatus: string;
  inn: string;
  /** ОГРНИП or ОГРН; empty for the self-employed. */
  ogrn: string;
  /** Where requests about personal data are sent. */
  email: string;
  phone: string;
  /** Postal address (city is enough for the self-employed). */
  address: string;
  /** Date of this version of both documents, YYYY-MM-DD. */
  updatedAt: string;
  /** After the paid date, how long a store's data is kept before deletion. */
  keepDataDays: number;
}

export type PreviewQuality = "low" | "medium" | "high";

export interface Settings {
  /** The two plans a store can be on: «Витрина» and «Витрина + ИИ» (the store's AI switch). */
  plans: { basic: Plan; ai: Plan };
  /** Slug of a store with sample products: «Посмотреть пример» on the landing. Empty — no button. */
  demoStoreSlug: string;
  /** «Написать нам» on the landing. */
  salesContacts: { whatsapp: string; phone: string };
  /** Who owners write or call: «Помощь» and «Подписка и итоги». */
  support: { whatsapp: string; phone: string; telegram: string };
  /** Short videos in «Помощь», 30–60 seconds each. Empty — no section. */
  helpVideos: HelpVideo[];
  legal: Legal;
  /** Free days for a newly connected store. */
  trialDays: number;
  /** AI cards per store per calendar month, unless the store has its own limit. */
  aiMonthlyLimit: number;
  /** Cards one AI preview takes from the month: a picture costs more than a text draft. */
  aiPreviewUnits: number;
  /** Model that fills in product cards, as the provider in AI_BASE_URL names it. */
  aiModel: string;
  /** «Превью с ИИ» in the product form; off — the button disappears. */
  aiPreviewEnabled: boolean;
  aiPreviewModel: string;
  /** medium keeps the text on a cover readable at ≈2 ₽; low blurs it, high costs several times more. */
  aiPreviewQuality: PreviewQuality;
  /** Rubles you pay for $1 of AI: the exchange rate plus a middleman's fee. Null — no ruble sums. */
  aiRubPerUsd: number | null;
}

function envText(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function envInteger(name: string, fallback: number, min: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

/** Starting values: the old .env settings where present, otherwise what a new installation gets. */
export function defaultSettings(): Settings {
  const previewModel = envText("AI_PREVIEW_MODEL");
  const quality = envText("AI_PREVIEW_QUALITY");
  const rate = Number(process.env.AI_RUB_PER_USD);
  return {
    plans: {
      basic: {
        name: "Витрина",
        price: null,
        description: "Каталог магазина по ссылке — всё, чтобы покупатели писали вам.",
        features: [
          "Ссылка на витрину и QR-плакат для кассы",
          "Товары с фото, размерами, цветами и ценами",
          "Кнопки WhatsApp, Telegram и звонка",
          "Статистика и отчёт за месяц",
          "Поможем запуститься и добавить первые товары"
        ]
      },
      ai: {
        name: "Витрина + ИИ",
        price: null,
        description: "То же, плюс ИИ-помощник: товар добавляется по фото и голосу за полминуты.",
        features: [
          "Всё из тарифа «Витрина»",
          "Карточка товара по фото и голосовому описанию",
          // «До N карточек с ИИ в месяц» is added by the landing from aiMonthlyLimit.
          "Много товаров сразу: ИИ сам разберёт фото по карточкам"
        ]
      }
    },
    demoStoreSlug: "demo",
    salesContacts: { whatsapp: "", phone: "" },
    support: { whatsapp: envText("SUPPORT_WHATSAPP"), phone: envText("SUPPORT_PHONE"), telegram: envText("SUPPORT_TELEGRAM") },
    helpVideos: [],
    legal: {
      operator: "",
      taxStatus: "самозанятый (плательщик налога на профессиональный доход)",
      inn: "",
      ogrn: "",
      email: "",
      phone: "",
      address: "",
      updatedAt: "2026-09-27",
      keepDataDays: 90
    },
    trialDays: envInteger("TRIAL_DAYS", 14, 1),
    aiMonthlyLimit: envInteger("AI_MONTHLY_LIMIT", 100, 0),
    aiPreviewUnits: envInteger("AI_PREVIEW_UNITS", 1, 1),
    // The cheapest tier: filling in a product card from photos doesn't need more (see aiPrices.ts).
    aiModel: envText("AI_MODEL", "OPENAI_MODEL") || "gpt-5.6-luna",
    aiPreviewEnabled: previewModel.toLowerCase() !== "off",
    aiPreviewModel: previewModel && previewModel.toLowerCase() !== "off" ? previewModel : "gpt-image-2.5-flare",
    aiPreviewQuality: quality === "low" || quality === "high" ? quality : "medium",
    aiRubPerUsd: rate > 0 ? rate : null
  };
}

// What the admin saved, read once at startup (loadSettings) and replaced on every save.
let saved: Partial<Record<keyof Settings, unknown>> = {};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reads the saved settings; call after initDatabase(). */
export function loadSettings() {
  const rows = rawDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  saved = {};
  for (const row of rows) {
    try {
      saved[row.key as keyof Settings] = JSON.parse(row.value);
    } catch {
      // A broken value falls back to the default.
    }
  }
}

/** Current settings: saved values over the defaults. A setting added later gets its default until saved. */
export function settings(): Settings {
  const result: Record<string, unknown> = { ...defaultSettings() };
  for (const [key, value] of Object.entries(saved)) {
    if (!(key in result) || value === undefined) continue;
    const base = result[key];
    result[key] = isObject(base) && isObject(value) ? { ...base, ...value } : value;
  }
  return result as unknown as Settings;
}

/** Saves the whole form at once. */
export function saveSettings(next: Settings) {
  const db = rawDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(
    "INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt"
  );
  db.transaction(() => {
    for (const [key, value] of Object.entries(next)) upsert.run(key, JSON.stringify(value), now);
  })();
  saved = { ...next };
  return settings();
}

/** What any visitor may see: plans and contacts for the landing, help videos, requisites for /offer and /privacy. */
export function publicSettings() {
  const { plans, aiMonthlyLimit, demoStoreSlug, salesContacts, helpVideos, legal } = settings();
  return { plans, aiMonthlyLimit, demoStoreSlug, salesContacts, helpVideos, legal };
}
