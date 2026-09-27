import { z } from "zod";
import { HttpError } from "./http.js";

// Request bodies are checked here, so a typo or a wrong type ends with a
// clear 400 («Поле «Цена»: неверный формат») instead of a 500.

const LABELS: Record<string, string> = {
  login: "Логин",
  password: "Пароль",
  currentPassword: "Текущий пароль",
  newPassword: "Новый пароль",
  name: "Название",
  ownerName: "Имя владельца",
  ownerId: "Владелец",
  storeName: "Название магазина",
  slug: "Адрес витрины",
  description: "Описание",
  address: "Адрес",
  phone: "Телефон",
  storePhone: "Номер для покупателей",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  workingHours: "Часы работы",
  email: "Почта",
  title: "Название",
  price: "Цена",
  priceText: "Текст цены",
  category: "Категория",
  status: "Наличие",
  isVisible: "Показывать на витрине",
  isActive: "Магазин включён",
  aiFormEnabled: "Тариф",
  aiMonthlyLimit: "Лимит ИИ",
  subscriptionEndsAt: "Подписка до",
  sizes: "Размеры",
  colors: "Цвета",
  variants: "Варианты",
  hex: "Цвет",
  colorName: "Цвет",
  colorHex: "Цвет",
  size: "Размер",
  imageIds: "Фото",
  amount: "Сумма",
  months: "Период",
  method: "Способ оплаты",
  comment: "Комментарий",
  trialDays: "Пробный период",
  days: "Дни"
};

function valueAt(data: unknown, path: PropertyKey[]) {
  return path.reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined), data);
}

function reason(issue: z.core.$ZodIssue, value: unknown) {
  switch (issue.code) {
    case "invalid_type":
      return value === undefined || value === null ? "обязательно" : "неверный формат";
    case "too_small":
      if (issue.origin === "string") return Number(issue.minimum) <= 1 ? "не заполнено" : `не короче ${issue.minimum} символов`;
      if (issue.origin === "array" || issue.origin === "set") return `нужно хотя бы ${issue.minimum}`;
      return `не меньше ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "string") return `не длиннее ${issue.maximum} символов`;
      if (issue.origin === "array" || issue.origin === "set") return `не больше ${issue.maximum} штук`;
      return `не больше ${issue.maximum}`;
    case "invalid_value":
    case "invalid_union":
      return "недопустимое значение";
    case "invalid_format":
      return "неверный формат";
    default:
      return issue.message && !/^[A-Za-z]/.test(issue.message) ? issue.message : "неверное значение";
  }
}

/** The body as the schema describes it (unknown fields dropped), or a 400 naming the first wrong field. */
export function parseBody<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = [...issue.path].reverse().find((key): key is string => typeof key === "string");
  const label = field ? (LABELS[field] ?? field) : null;
  throw new HttpError(400, `${label ? `Поле «${label}»` : "Данные"}: ${reason(issue, valueAt(data, issue.path))}`);
}

// Building blocks

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => z.string().trim().min(1).max(max);
/** Optional text field: absent — don't change, null or "" — clear. */
const optionalText = (max: number) => text(max).nullable().optional();
/** 0/1 flags; the frontend sometimes sends true/false. */
const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((value) => (value ? 1 : 0));
/** Rubles: a number, a numeric string ("1 500", "1500,50") or empty for «no price». */
const price = z.preprocess((value) => {
  if (value === "" || value === undefined) return value === "" ? null : undefined;
  if (typeof value === "string") return Number(value.replace(/\s/g, "").replace(",", "."));
  return value;
}, z.number().min(0).max(100_000_000).nullable().optional());
/** A color swatch: a wrong or empty code (the AI sometimes invents one) just means «no swatch». */
const hex = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const code = typeof value === "string" ? value.trim() : "";
  return /^#?[0-9a-fA-F]{3,8}$/.test(code) ? code : null;
}, z.string().nullable().optional());
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: "неверная дата" });

// Auth

export const loginSchema = z.object({ login: requiredText(200), password: z.string().min(1).max(200) });

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(6).max(200) });

// Products

const productFields = {
  title: requiredText(200),
  description: optionalText(5000),
  price,
  priceText: optionalText(100),
  category: optionalText(100),
  status: z.enum(["AVAILABLE", "NOT_AVAILABLE", "CHECK_IN_STORE"]).optional(),
  isVisible: flag.optional(),
  // Empty sizes and color names are skipped by the service, so they are allowed here.
  sizes: z.array(text(40)).max(60).optional(),
  colors: z.array(z.object({ name: text(60), hex })).max(60).optional(),
  variants: z
    .array(z.object({ colorName: text(60), colorHex: hex, size: text(40), price }))
    .max(1000)
    .optional()
};

export const productCreateSchema = z.object(productFields);
export const productUpdateSchema = z.object(productFields).partial();
export const imageOrderSchema = z.object({ imageIds: z.array(z.string().max(100)).max(100) });

// Stores

/** What an owner may change in «Реквизиты». */
export const storeDetailsSchema = z.object({
  name: requiredText(120).optional(),
  description: optionalText(2000),
  address: optionalText(300),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  telegram: optionalText(100),
  workingHours: optionalText(120)
});

const aiLimit = z.preprocess(
  (value) => (value === "" ? null : typeof value === "string" ? Number(value) : value),
  z.number().int().min(0).max(100_000).nullable().optional()
);

const adminStoreFields = {
  ...storeDetailsSchema.shape,
  ownerId: z.string().min(1).max(100),
  name: requiredText(120),
  slug: requiredText(40),
  isActive: flag.optional(),
  aiFormEnabled: flag.optional(),
  subscriptionEndsAt: isoDate.nullable().optional(),
  aiMonthlyLimit: aiLimit
};

export const storeCreateSchema = z.object(adminStoreFields);
export const storeUpdateSchema = z.object(adminStoreFields).partial();

// Owners

const emailField = z.preprocess((value) => (value === "" ? null : value), z.email().max(200).nullable().optional());

export const ownerCreateSchema = z.object({
  name: requiredText(100),
  email: emailField,
  phone: optionalText(40),
  password: z.string().min(6).max(200)
});

export const ownerUpdateSchema = z.object({ name: requiredText(100).optional(), email: emailField, phone: optionalText(40) });

export const ownerPasswordSchema = z.object({ password: z.string().trim().min(6).max(200) });

// Money and onboarding

export const paymentSchema = z.object({
  amount: z.coerce.number().int().min(0).max(10_000_000),
  months: z.coerce.number().int().min(1).max(12),
  method: z.enum(["CASH", "TRANSFER", "OTHER"]),
  comment: optionalText(500),
  receipt: optionalText(500)
});

export const receiptSchema = z.object({ receipt: optionalText(500) });

export const connectSchema = z.object({
  ownerName: requiredText(100),
  phone: requiredText(40),
  email: emailField,
  storeName: requiredText(120),
  slug: requiredText(40),
  storePhone: optionalText(40),
  withAi: z.boolean().default(false),
  trialDays: z.coerce.number().int().min(0).max(60),
  leadId: z.string().max(100).nullable().optional()
});

export const leadStatusSchema = z.object({ status: z.enum(["NEW", "DONE"]) });
