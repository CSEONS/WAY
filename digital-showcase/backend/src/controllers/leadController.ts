import type { Response } from "express";
import * as leadService from "../services/leadService.js";
import { normalizePhone } from "../services/userService.js";
import { asyncHandler, HttpError } from "../utils/http.js";
import { leadStatusSchema, parseBody } from "../utils/validation.js";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** What a bot is told: it worked. Nothing is saved, so it has no reason to try another way. */
function pretendSent(res: Response) {
  res.status(201).json({ ok: true });
}

/**
 * «Оставить заявку» on the landing: a name, a phone and a comment if any.
 * Against spam, in this order: a hidden field only bots fill and a form sent
 * faster than a person can (both answered as if sent), a few attempts per
 * address, one lead per phone while it's new (a repeat isn't saved again or
 * sent to Telegram), and a cap on leads from everyone per hour.
 */
export const createLead = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  if (text(body.website, 200)) return pretendSent(res);
  const filledMs = Number(body.filledMs);
  // Missing: a page from before this check, or a script posting directly.
  if (body.filledMs == null || !Number.isFinite(filledMs)) throw new HttpError(400, "Обновите страницу и отправьте заявку ещё раз");
  if (filledMs < leadService.LEAD_LIMITS.minFillMs) return pretendSent(res);
  if (body.consent !== true) throw new HttpError(400, "Нужно согласие на обработку персональных данных");

  const name = text(body.name, 100);
  const phone = text(body.phone, 40);
  const digits = normalizePhone(phone).length;
  if (!name) throw new HttpError(400, "Укажите, как к вам обращаться");
  if (digits < 10 || digits > 15) throw new HttpError(400, "Укажите телефон, чтобы мы могли перезвонить");

  if (leadService.overIpLimit(req.ip ?? "unknown")) {
    throw new HttpError(429, "Вы уже отправили несколько заявок — мы перезвоним. Если срочно, позвоните или напишите нам.");
  }
  if (await leadService.openLeadByPhone(phone)) {
    res.json({ ok: true, repeat: true });
    return;
  }
  if (await leadService.tooManyLeads()) {
    throw new HttpError(429, "Сейчас очень много заявок. Позвоните или напишите нам — контакты рядом с формой.");
  }

  const lead = await leadService.createLead({ name, phone, comment: text(body.comment, 1000) });
  await leadService.notifyTelegram(lead);
  res.status(201).json({ ok: true });
});

export const listLeads = asyncHandler(async (_req, res) => {
  res.json(await leadService.listLeads());
});

export const updateLead = asyncHandler(async (req, res) => {
  const { status } = parseBody(leadStatusSchema, req.body);
  const lead = await leadService.setLeadStatus(String(req.params.id), status);
  if (!lead) throw new HttpError(404, "Заявка не найдена");
  res.json(lead);
});
