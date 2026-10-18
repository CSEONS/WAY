import { rawDb } from "../database/db.js";

// What the admin changes in the admin panel without touching files: contacts,
// requisites, help videos, the trial, AI models and the ruble rate. Plans and
// prices are a table of their own (planService).
// These used to live in .env and in frontend config files. The old .env values
// (TRIAL_DAYS, AI_MODEL, SUPPORT_*, …) are still the starting point until the
// admin saves. Secrets and infrastructure — keys, provider addresses, the
// domain, backups — stay in .env.

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

/** A free period: so many days or calendar months. */
export interface TrialPeriod {
  count: number;
  unit: "days" | "months";
}

export interface Settings {
  /** «Написать нам» on the landing. */
  salesContacts: { whatsapp: string; phone: string };
  /** Who owners write or call: «Помощь» and «Подписка и итоги». */
  support: { whatsapp: string; phone: string; telegram: string };
  /** Short videos in «Помощь», 30–60 seconds each. Empty — no section. */
  helpVideos: HelpVideo[];
  legal: Legal;
  /** Free days for a newly connected store. */
  trial: TrialPeriod;
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
    trial: { count: envInteger("TRIAL_DAYS", 14, 1), unit: "days" },
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

/** What any visitor may see: contacts for the landing, help videos, requisites for /offer and /privacy. Plans come from planService. */
export function publicSettings() {
  const { salesContacts, helpVideos, legal } = settings();
  return { salesContacts, helpVideos, legal };
}
