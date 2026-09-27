import { Router } from "express";
import * as controller from "../controllers/authController.js";
import { authMiddleware, notWhileImpersonating } from "../middleware/authMiddleware.js";

export const authRoutes = Router();
authRoutes.post("/login", controller.login);
authRoutes.get("/me", authMiddleware, controller.me);
authRoutes.post("/change-password", authMiddleware, notWhileImpersonating, controller.changePassword);
authRoutes.post("/logout", authMiddleware, controller.logout);
