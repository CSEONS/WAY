import { getDb } from "../database/db.js";
import type { Lead, LeadStatus } from "../types/models.js";
import { sendTelegram } from "../utils/telegram.js";

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
