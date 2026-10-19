import { Router } from "express";
import * as controller from "../controllers/notificationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

// The bell in the header: every signed-in user reads their own notifications.
export const notificationRoutes = Router();
notificationRoutes.use(authMiddleware);
notificationRoutes.get("/", controller.listMine);
notificationRoutes.post("/read", controller.markRead);
