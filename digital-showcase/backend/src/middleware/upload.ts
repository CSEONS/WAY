import multer from "multer";
import { HttpError } from "../utils/http.js";

const configuredMaxBytes = Number(process.env.IMAGE_UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);
const imageUploadMaxBytes = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0 ? configuredMaxBytes : 15 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageUploadMaxBytes },
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
  limits: { fileSize: imageUploadMaxBytes, files: 9 },
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

export const bulkAiDraftUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageUploadMaxBytes, files: 41 },
  fileFilter: (_req, file, cb) => {
    const isVoice = file.fieldname === "voice" && (file.mimetype.startsWith("audio/") || file.mimetype === "video/webm");
    const isImage = file.fieldname === "images" && ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    if (!isVoice && !isImage) return cb(new HttpError(400, "Массовый AI-черновик принимает изображения и одну голосовую запись"));
    cb(null, true);
  }
});
