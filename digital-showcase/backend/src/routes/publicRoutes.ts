import { Router } from "express";
import * as controller from "../controllers/publicController.js";

export const publicRoutes = Router();
publicRoutes.get("/stores/:slug", controller.getStore);
publicRoutes.get("/stores/:slug/products", controller.listProducts);
publicRoutes.get("/stores/:slug/products/:productId", controller.getProduct);
