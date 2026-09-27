import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { trustProxy } from "./config.js";
import { rawDb } from "./database/db.js";
import { adminRoutes } from "./routes/adminRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { ogRoutes } from "./routes/ogRoutes.js";
import { ownerRoutes } from "./routes/ownerRoutes.js";
import { publicRoutes } from "./routes/publicRoutes.js";
import { seoRoutes } from "./routes/seoRoutes.js";
import { reportProblem } from "./services/alertService.js";
import { lastSuccessfulBackup } from "./services/backupService.js";
import { HttpError } from "./utils/http.js";

export const app = express();
// Only nginx in front: req.ip is the visitor's address and can't be faked with X-Forwarded-For.
app.set("trust proxy", trustProxy());

app.use(
  helmet({
    // The backend serves no app pages (the SPA comes from the frontend container);
    // the crawler preview pages redirect with an inline script.
    contentSecurityPolicy: false,
    // Photos are shown in messenger previews and other sites.
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost", credentials: true, exposedHeaders: ["X-Total-Count"] }));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(process.env.UPLOAD_DIR ?? path.resolve("uploads")));

function limiter(windowMinutes: number, limit: number, message: string, options: { skipSuccessfulRequests?: boolean } = {}) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests,
    message: { message }
  });
}

// Password guessing: 10 wrong attempts per 15 minutes from one address. Successful sign-ins don't count.
const signInLimit = limiter(15, 10, "Слишком много попыток входа. Подождите 15 минут и попробуйте снова.", { skipSuccessfulRequests: true });
app.use("/api/auth/login", signInLimit);
app.use("/api/auth/change-password", signInLimit);
// Storefronts: far above what a person clicks, stops scripts hammering the server.
app.use("/api/public", limiter(1, 300, "Слишком много запросов. Подождите минуту."));

const startedAt = Date.now();

/** For Docker and an external uptime monitor: 200 while the database answers, 503 otherwise. */
app.get("/api/health", async (_req, res) => {
  try {
    rawDb().prepare("SELECT 1").get();
  } catch (error) {
    await reportProblem("База данных не отвечает", error);
    res.status(503).json({ ok: false, database: "error" });
    return;
  }
  const backup = await lastSuccessfulBackup().catch(() => undefined);
  res.json({
    ok: true,
    database: "ok",
    uptimeMinutes: Math.round((Date.now() - startedAt) / 60000),
    lastBackupHoursAgo: backup?.finishedAt ? Math.round((Date.now() - Date.parse(backup.finishedAt)) / 3600000) : null
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/public", publicRoutes);
app.use(seoRoutes);
// Bot-only OG-tag preview shell for /m/:slug and /m/:slug/p/:productId —
// nginx only routes known crawler user agents here (see nginx.conf); real
// visitors hit the SPA on the frontend service directly.
app.use(ogRoutes);

const UPLOAD_ERRORS: Record<string, string> = {
  LIMIT_FILE_SIZE: "Файл слишком большой",
  LIMIT_FILE_COUNT: "Слишком много файлов за раз",
  LIMIT_UNEXPECTED_FILE: "Лишний файл в запросе"
};

app.use((_req, _res, next) => next(new HttpError(404, "Маршрут не найден")));
app.use((error: Error & { type?: string }, req: Request, res: Response, _next: NextFunction) => {
  let status = 500;
  let message = error.message;
  if (error instanceof HttpError) status = error.status;
  else if (error instanceof multer.MulterError) {
    status = 400;
    message = UPLOAD_ERRORS[error.code] ?? "Не удалось принять файл";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Неверный формат запроса";
  } else if (error.type === "entity.too.large") {
    status = 413;
    message = "Слишком большой запрос";
  }

  if (status === 500) {
    void reportProblem("Ошибка 500 на сервере", error, `${req.method} ${req.originalUrl}`);
    if (process.env.NODE_ENV === "production") message = "Внутренняя ошибка сервера";
  }
  res.status(status).json({ message: message || "Внутренняя ошибка сервера" });
});
