import { Router } from "express";
import * as controller from "../controllers/yookassaController.js";

// ЮKassa → «Интеграция» → «HTTP-уведомления»: https://<домен>/api/yookassa/notifications,
// events payment.succeeded and payment.canceled. No sign-in: what's in the body is checked with ЮKassa.
export const yookassaRoutes = Router();
yookassaRoutes.post("/notifications", controller.notification);
