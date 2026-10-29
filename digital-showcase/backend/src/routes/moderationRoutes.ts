import { Router } from "express";
import * as controller from "../controllers/moderationController.js";
import { authMiddleware, moderatorOnly } from "../middleware/authMiddleware.js";

// Moderation of photos with living beings. Its own routes and guard, so a
// moderator role can get them later without access to the rest of the admin panel.
export const moderationRoutes = Router();
moderationRoutes.use(authMiddleware, moderatorOnly);
moderationRoutes.get("/images", controller.listImages);
moderationRoutes.post("/images/review", controller.reviewImages);
moderationRoutes.patch("/images/:id", controller.reviewImage);
moderationRoutes.get("/products/blocked", controller.listBlockedProducts);
moderationRoutes.post("/products/:id/unblock", controller.unblockProduct);
