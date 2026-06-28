import { Router } from "express";
import * as controller from "../controllers/ownerController.js";
import { authMiddleware, ownerOnly } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";

export const ownerRoutes = Router();
ownerRoutes.use(authMiddleware, ownerOnly);
ownerRoutes.get("/store", controller.getStore);
ownerRoutes.patch("/store", controller.updateStore);
ownerRoutes.get("/products", controller.listProducts);
ownerRoutes.post("/products/ai-draft", controller.createProductDraft);
ownerRoutes.post("/products", controller.createProduct);
ownerRoutes.get("/products/:id", controller.getProduct);
ownerRoutes.patch("/products/:id", controller.updateProduct);
ownerRoutes.delete("/products/:id", controller.deleteProduct);
ownerRoutes.post("/products/:id/images", upload.single("image"), controller.addImage);
ownerRoutes.delete("/products/:id/images/:imageId", controller.deleteImage);
