import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types/models.js";
import { logAction } from "../services/auditService.js";
import { HttpError } from "../utils/http.js";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, "Требуется авторизация"));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? "change_me") as JwtPayload;
    next();
  } catch {
    next(new HttpError(401, "Недействительный токен"));
  }
}

export function adminOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") return next(new HttpError(403, "Доступ только для администратора"));
  next();
}

export function ownerOnly(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "OWNER") return next(new HttpError(403, "Доступ только для владельца"));
  next();
}

/**
 * While an admin is signed in as an owner, every change they make is written
 * to the journal: what was changed and whether it worked.
 */
export function logActionsAsOwner(req: Request, res: Response, next: NextFunction) {
  const adminId = req.user?.impersonatedBy;
  if (adminId && req.method !== "GET") {
    const action = describeOwnerAction(req.method, req.path);
    res.on("finish", () => {
      const result = res.statusCode >= 400 ? ` — ошибка ${res.statusCode}` : "";
      void logAction(adminId, "ACTION_AS_OWNER", { type: "owner", id: req.user!.userId }, `${action}${result}`);
    });
  }
  next();
}

/** The admin helps as the owner but doesn't change the owner's password. */
export function notWhileImpersonating(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.impersonatedBy) return next(new HttpError(403, "Недоступно при входе от имени владельца"));
  next();
}

const OWNER_ACTIONS: [method: string, path: RegExp, label: string][] = [
  ["POST", /\/products\/bulk-ai-draft$/, "ИИ-черновики нескольких товаров"],
  ["POST", /\/products\/ai-draft$/, "ИИ-черновик товара"],
  ["PATCH", /\/products\/[^/]+\/images\/order$/, "Изменил порядок фото"],
  ["DELETE", /\/products\/[^/]+\/images\/[^/]+$/, "Удалил фото товара"],
  ["POST", /\/products\/[^/]+\/images$/, "Загрузил фото товара"],
  ["POST", /\/products$/, "Добавил товар"],
  ["PATCH", /\/products\/[^/]+$/, "Изменил товар"],
  ["DELETE", /\/products\/[^/]+$/, "Удалил товар"],
  ["POST", /\/logo$/, "Загрузил логотип"],
  ["PATCH", /\/stores\/[^/]+$|\/store$/, "Изменил реквизиты магазина"]
];

/** «Изменил товар» instead of «PATCH /stores/…/products/…» in the journal. */
function describeOwnerAction(method: string, path: string) {
  return OWNER_ACTIONS.find(([actionMethod, pattern]) => actionMethod === method && pattern.test(path))?.[2] ?? `${method} ${path}`;
}
