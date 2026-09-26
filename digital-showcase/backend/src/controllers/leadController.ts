import * as leadService from "../services/leadService.js";
import { normalizePhone } from "../services/userService.js";
import type { LeadStatus } from "../types/models.js";
import { asyncHandler, HttpError } from "../utils/http.js";

const MAX_LEADS_PER_HOUR = 5;
const recentByIp = new Map<string, number[]>();

/** A handful of requests per IP per hour is plenty for a real person and stops simple spam loops. */
function isRateLimited(ip: string) {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = (recentByIp.get(ip) ?? []).filter((time) => time > hourAgo);
  const limited = recent.length >= MAX_LEADS_PER_HOUR;
  if (!limited) recent.push(Date.now());
  recentByIp.set(ip, recent);
  return limited;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** «Оставить заявку» on the landing page. */
export const createLead = asyncHandler(async (req, res) => {
  // Honeypot: a hidden field real visitors never fill. Pretend success for bots.
  if (text(req.body?.website, 200)) {
    res.status(201).json({ ok: true });
    return;
  }
  if (req.body?.consent !== true) throw new HttpError(400, "Нужно согласие на обработку персональных данных");

  const name = text(req.body.name, 100);
  const phone = text(req.body.phone, 40);
  if (!name) throw new HttpError(400, "Укажите, как к вам обращаться");
  if (normalizePhone(phone).length < 10) throw new HttpError(400, "Укажите телефон, чтобы мы могли перезвонить");
  if (isRateLimited(req.ip ?? "unknown")) throw new HttpError(429, "Слишком много заявок. Попробуйте позже или позвоните нам.");

  const lead = await leadService.createLead({
    name,
    phone,
    storeName: text(req.body.storeName, 150),
    city: text(req.body.city, 100),
    comment: text(req.body.comment, 1000)
  });
  await leadService.notifyTelegram(lead);
  res.status(201).json({ ok: true });
});

export const listLeads = asyncHandler(async (_req, res) => {
  res.json(await leadService.listLeads());
});

export const updateLead = asyncHandler(async (req, res) => {
  const status = req.body?.status as LeadStatus;
  if (status !== "NEW" && status !== "DONE") throw new HttpError(400, "Неизвестный статус заявки");
  const lead = await leadService.setLeadStatus(String(req.params.id), status);
  if (!lead) throw new HttpError(404, "Заявка не найдена");
  res.json(lead);
});
