import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { adminRoutes } from "./routes/adminRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { ownerRoutes } from "./routes/ownerRoutes.js";
import { publicRoutes } from "./routes/publicRoutes.js";
import { HttpError } from "./utils/http.js";

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(process.env.UPLOAD_DIR ?? path.resolve("uploads")));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/public", publicRoutes);

app.use((_req, _res, next) => next(new HttpError(404, "Маршрут не найден")));
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.status : 500;
  res.status(status).json({ message: error.message || "Внутренняя ошибка сервера" });
});
