import { Router } from "express";
import * as controller from "../controllers/seoController.js";

// Served at the site root (nginx proxies /robots.txt and /sitemap.xml here).
export const seoRoutes = Router();
seoRoutes.get("/robots.txt", controller.robots);
seoRoutes.get("/sitemap.xml", controller.sitemap);
