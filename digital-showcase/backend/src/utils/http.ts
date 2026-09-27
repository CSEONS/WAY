import type { NextFunction, Request, Response } from "express";

/** Public origin of the request behind nginx, e.g. https://example.ru. */
export function requestOrigin(req: Request) {
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host");
  return `${proto}://${host}`;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function requireFields(body: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new HttpError(400, `Поле ${field} обязательно`);
    }
  }
}
