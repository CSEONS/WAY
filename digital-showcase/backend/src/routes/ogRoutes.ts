import { Router } from "express";
import * as controller from "../controllers/ogController.js";

export const ogRoutes = Router();
ogRoutes.get("/m/:slug", controller.renderStoreOg);
ogRoutes.get("/m/:slug/p/:productId", controller.renderProductOg);
