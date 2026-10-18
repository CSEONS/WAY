import { getDb } from "../database/db.js";
import type { Lead, LeadStatus } from "../types/models.js";
import { sendTelegram } from "../utils/telegram.js";
import { normalizePhone } from "./userService.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Spam limits of «Оставить заявку» on the landing (see leadController.createLead). */
export const LEAD_LIMITS = {
  /** Sent sooner after the form appeared: faster than a person types a name and a phone — a script. */
  minFillMs: 3000,
  /** From one address. */
  perIpPerHour: 3,
  perIpPerDay: 10,
  /** From everyone together: a flood from many addresses stops here, before it reaches Telegram. */
  totalPerHour: 30,
  /** The same phone again while its lead is still new: no second lead. */
  repeatHours: 24
};

// Attempts per address, in memory: a restart forgets them, which is fine for spam.
const attemptsByIp = new Map<string, number[]>();

/**
 * Counts an attempt from this address. True — it's over the hourly or daily
 * limit, and then it isn't counted. Addresses quiet for a day are forgotten.
 */
export function overIpLimit(ip: string, now = Date.now()) {
  const dayAgo = now - DAY_MS;
  const recent = (attemptsByIp.get(ip) ?? []).filter((time) => time > dayAgo);
  const lastHour = recent.filter((time) => time > now - HOUR_MS).length;
  const limited = lastHour >= LEAD_LIMITS.perIpPerHour || recent.length >= LEAD_LIMITS.perIpPerDay;
  if (!limited) recent.push(now);
  attemptsByIp.set(ip, recent);
  if (attemptsByIp.size > 1000) {
    for (const [key, times] of attemptsByIp) if (!times.some((time) => time > dayAgo)) attemptsByIp.delete(key);
  }
  return limited;
}

/** A new lead with this phone (however it's written) from the last repeatHours: that person already waits for a call. */
export async function openLeadByPhone(phone: string, now = new Date()) {
  const db = await getDb();
  const since = new Date(now.getTime() - LEAD_LIMITS.repeatHours * HOUR_MS).toISOString();
  const rows = await db.all<Lead>("SELECT * FROM leads WHERE status = 'NEW' AND createdAt >= ? ORDER BY createdAt DESC", since);
  const wanted = normalizePhone(phone);
  return rows.find((lead) => normalizePhone(lead.phone) === wanted) ?? null;
}

/** Leads from everyone in the last hour reached LEAD_LIMITS.totalPerHour. */
export async function tooManyLeads(now = new Date()) {
  const db = await getDb();
  const row = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE createdAt >= ?", new Date(now.getTime() - HOUR_MS).toISOString());
  return (row?.count ?? 0) >= LEAD_LIMITS.totalPerHour;
}

export interface LeadInput {
  name: string;
  phone: string;
  storeName?: string | null;
  city?: string | null;
  comment?: string | null;
}

export async function createLead(input: LeadInput) {
  const db = await getDb();
  const lead: Lead = {
    id: crypto.randomUUID(),
    name: input.name,
    phone: input.phone,
    storeName: input.storeName || null,
    city: input.city || null,
    comment: input.comment || null,
    status: "NEW",
    createdAt: new Date().toISOString()
  };
  await db.run(
    "INSERT INTO leads (id, name, phone, storeName, city, comment, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    lead.id,
    lead.name,
    lead.phone,
    lead.storeName,
    lead.city,
    lead.comment,
    lead.status,
    lead.createdAt
  );
  return lead;
}

export async function listLeads() {
  const db = await getDb();
  return db.all<Lead>("SELECT * FROM leads ORDER BY status = 'DONE', createdAt DESC");
}

export async function setLeadStatus(id: string, status: LeadStatus) {
  const db = await getDb();
  await db.run("UPDATE leads SET status = ? WHERE id = ?", status, id);
  return db.get<Lead>("SELECT * FROM leads WHERE id = ?", id);
}

/**
 * Sends a new lead to the admin's Telegram when TELEGRAM_BOT_TOKEN and
 * TELEGRAM_CHAT_ID are set. Never throws: the lead is already saved and is
 * visible in the admin panel either way.
 */
export async function notifyTelegram(lead: Lead) {
  const text = [
    "Новая заявка с сайта",
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.storeName && `Магазин: ${lead.storeName}`,
    lead.city && `Город: ${lead.city}`,
    lead.comment && `Комментарий: ${lead.comment}`
  ]
    .filter(Boolean)
    .join("\n");
  return sendTelegram(text);
}
