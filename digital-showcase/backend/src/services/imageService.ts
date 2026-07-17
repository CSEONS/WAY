import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function optimizeImageForAi(file: UploadedImage) {
  const dimension = positiveInteger("AI_IMAGE_MAX_DIMENSION", 512);
  return sharp(file.buffer, { failOn: "error" })
    .rotate()
    .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality: positiveInteger("AI_IMAGE_QUALITY", 72) })
    .toBuffer();
}

export async function storeProductImage(file: UploadedImage) {
  const dimension = positiveInteger("PRODUCT_IMAGE_MAX_DIMENSION", 2048);
  const maxBytes = positiveInteger("PRODUCT_IMAGE_MAX_BYTES", 10 * 1024 * 1024);
  let quality = Math.min(95, positiveInteger("PRODUCT_IMAGE_QUALITY", 86));
  let output = await productPipeline(file, dimension, quality);

  while (output.length > maxBytes && quality > 45) {
    quality -= 8;
    output = await productPipeline(file, dimension, quality);
  }
  if (output.length > maxBytes) throw new Error(`Не удалось оптимизировать изображение до ${maxBytes} байт`);

  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.webp`;
  await fs.promises.writeFile(path.join(uploadDir, filename), output);
  return `/uploads/${filename}`;
}

async function productPipeline(file: UploadedImage, dimension: number, quality: number) {
  return sharp(file.buffer, { failOn: "error" })
    .rotate()
    .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

export async function deleteStoredImage(url?: string | null) {
  if (!url?.startsWith("/uploads/")) return;
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  const filePath = path.resolve(uploadDir, path.basename(url));
  if (!filePath.startsWith(`${uploadDir}${path.sep}`)) return;
  await fs.promises.rm(filePath, { force: true });
}
