import { Router } from "express";
import * as controller from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

export const authRoutes = Router();
authRoutes.post("/login", controller.login);
authRoutes.get("/me", authMiddleware, controller.me);
authRoutes.post("/change-password", authMiddleware, controller.changePassword);
authRoutes.post("/logout", authMiddleware, controller.logout);
