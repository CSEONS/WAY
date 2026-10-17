import crypto from "node:crypto";
import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import type { TrialPeriod } from "./settingsService.js";
import { slugify } from "../utils/slug.js";
import { logAction } from "./auditService.js";
import { setLeadStatus } from "./leadService.js";
import { assertSlugAvailable, createStore, getStoreBySlug } from "./storeService.js";
import { trialEnd, trialLabel } from "./subscriptionService.js";
import { createOwner, deleteOwner, findUserByLogin, normalizePhone } from "./userService.js";

export interface ConnectStoreInput {
  ownerName: string;
  /** The owner's login and, unless `storePhone` is given, the store's WhatsApp and phone. */
  phone: string;
  email?: string | null;
  storeName: string;
  slug: string;
  /** Number buyers write to, if it's not the owner's own. */
  storePhone?: string | null;
  /** «Тарифы и цены»; none — the first plan. */
  planId?: string | null;
  /** Free period for this store: count 0 — none, it has to pay right away. */
  trial: TrialPeriod;
  /** A landing-page request this connection answers: marked as done. */
  leadId?: string | null;
}


/** 8 digits: easy to dictate over the phone and to type on a phone keypad. */
export function generatePassword() {
  return Array.from({ length: 8 }, () => crypto.randomInt(10)).join("");
}

/** The first free address based on a store name: «butik-leyla», then «butik-leyla-2»… */
export async function suggestSlug(name: string) {
  const base = slugify(name) || "shop";
  for (let index = 1; index < 100; index++) {
    const candidate = index === 1 ? base : `${base.slice(0, 36)}-${index}`;
    if (!(await getStoreBySlug(candidate))) return candidate;
  }
  return `${base.slice(0, 30)}-${Date.now().toString(36)}`;
}

/**
 * «Подключить магазин»: owner, store and trial period in one step, with a
 * generated password. Nothing is left half-created if any step fails.
 */
export async function connectStore(input: ConnectStoreInput, adminId: string) {
  const ownerName = input.ownerName?.trim();
  const storeName = input.storeName?.trim();
  const phone = input.phone?.trim();
  const email = input.email?.trim() || null;
  const slug = input.slug?.trim().toLowerCase();
  if (!ownerName) throw new HttpError(400, "Укажите имя владельца");
  if (!phone || normalizePhone(phone).length < 10) throw new HttpError(400, "Укажите телефон владельца — это его логин");
  if (!storeName) throw new HttpError(400, "Укажите название магазина");
  const maxTrial = input.trial?.unit === "months" ? 12 : 60;
  if (!input.trial || !Number.isInteger(input.trial.count) || input.trial.count < 0 || input.trial.count > maxTrial) {
    throw new HttpError(400, "Пробный период — до 60 дней или до 12 месяцев");
  }
  await assertSlugAvailable(slug);

  const samePhone = await findUserByLogin(phone);
  if (samePhone) throw new HttpError(400, `Телефон уже используется: ${samePhone.name}. Добавьте магазин этому владельцу в разделе «Магазины».`);
  if (email) {
    const db = await getDb();
    const sameEmail = await db.get<{ name: string }>("SELECT name FROM users WHERE LOWER(email) = LOWER(?)", email);
    if (sameEmail) throw new HttpError(400, `Почта уже используется: ${sameEmail.name}`);
  }

  const password = generatePassword();
  const owner = await createOwner({ name: ownerName, phone, email: email ?? undefined, password });
  if (!owner) throw new HttpError(500, "Не удалось создать владельца");

  const storePhone = input.storePhone?.trim() || phone;
  let store;
  try {
    store = await createStore({
      ownerId: owner.id,
      name: storeName,
      slug,
      phone: storePhone,
      whatsapp: storePhone,
      planId: input.planId ?? null,
      isActive: 1,
      subscriptionEndsAt: trialEnd(input.trial).toISOString()
    });
  } catch (error) {
    await deleteOwner(owner.id);
    throw error;
  }
  if (!store) {
    await deleteOwner(owner.id);
    throw new HttpError(500, "Не удалось создать магазин");
  }

  if (input.leadId) await setLeadStatus(input.leadId, "DONE");
  await logAction(adminId, "STORE_CONNECTED", { type: "store", id: store.id, name: store.name }, `Владелец ${owner.name}, пробный период ${input.trial.count ? trialLabel(input.trial) : "без него"}`);
  return { owner, store, password };
}
