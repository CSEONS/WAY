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

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("audio/") && file.mimetype !== "video/webm") {
      cb(new HttpError(400, "Можно загружать только аудиозапись"));
      return;
    }
    cb(null, true);
  }
});

export const aiDraftUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 9 },
  fileFilter: (_req, file, cb) => {
    const isVoice = file.fieldname === "voice" && (file.mimetype.startsWith("audio/") || file.mimetype === "video/webm");
    const isImage = file.fieldname === "images" && ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);

    if (!isVoice && !isImage) {
      cb(new HttpError(400, "AI-черновик принимает только изображения товара и голосовую запись"));
      return;
    }

    cb(null, true);
  }
});
