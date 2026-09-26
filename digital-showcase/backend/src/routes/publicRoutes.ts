import { Router } from "express";
import * as leadController from "../controllers/leadController.js";
import * as controller from "../controllers/publicController.js";

export const publicRoutes = Router();
publicRoutes.get("/stores/:slug", controller.getStore);
publicRoutes.get("/stores/:slug/products", controller.listProducts);
publicRoutes.get("/stores/:slug/filters", controller.getFilters);
publicRoutes.post("/stores/:slug/contact-click", controller.recordContactClick);
publicRoutes.post("/leads", leadController.createLead);
publicRoutes.get("/stores/:slug/products/:productId", controller.getProduct);
