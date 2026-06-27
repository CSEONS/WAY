import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../types/models.js";
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
