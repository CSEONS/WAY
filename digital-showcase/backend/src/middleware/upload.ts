import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { HttpError } from "../utils/http.js";

const uploadDir = process.env.UPLOAD_DIR ?? path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      cb(new HttpError(400, "Можно загружать только jpg, jpeg, png или webp"));
      return;
    }
    cb(null, true);
  }
});
