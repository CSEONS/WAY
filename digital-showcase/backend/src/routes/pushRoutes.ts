import { Router } from "express";
import * as controller from "../controllers/pushController.js";
import { authMiddleware, notWhileImpersonating, ownerOnly } from "../middleware/authMiddleware.js";

// Notifications on the owner's phone (see pushService). An admin signed in as
// the owner can't turn them on: the owner's notifications would go to the admin's phone.
export const pushRoutes = Router();
pushRoutes.use(authMiddleware, ownerOnly, notWhileImpersonating);
pushRoutes.get("/", controller.publicKey);
pushRoutes.post("/subscriptions", controller.subscribe);
pushRoutes.delete("/subscriptions", controller.unsubscribe);
pushRoutes.post("/test", controller.test);
