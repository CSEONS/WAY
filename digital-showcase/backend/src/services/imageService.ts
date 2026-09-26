import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Smaller copies saved next to every product photo and logo, so the storefront
 * grid does not download 2048px originals. Named by convention:
 * /uploads/<id>.webp → /uploads/<id>-400.webp and /uploads/<id>-800.webp.
 * The frontend builds `srcset` from the same convention (see imageUrls.ts).
 */
export const THUMBNAIL_WIDTHS = [400, 800] as const;
const THUMBNAIL_QUALITY = 78;
const ORIGINAL_NAME = /^[0-9a-f-]{36}\.webp$/;

function uploadDir() {
  return path.resolve(process.env.UPLOAD_DIR ?? "uploads");
}

function thumbnailName(filename: string, width: number) {
  return filename.replace(/\.webp$/, `-${width}.webp`);
}

async function writeThumbnails(source: Buffer, filename: string) {
  await Promise.all(
    THUMBNAIL_WIDTHS.map((width) =>
      sharp(source, { failOn: "error" })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
        .toFile(path.join(uploadDir(), thumbnailName(filename, width)))
    )
  );
}

/** Creates missing thumbnails for photos uploaded before thumbnails existed. Safe to run on every start. */
export async function ensureThumbnails() {
  const dir = uploadDir();
  if (!fs.existsSync(dir)) return 0;
  const files = new Set(await fs.promises.readdir(dir));
  let created = 0;
  for (const filename of files) {
    if (!ORIGINAL_NAME.test(filename)) continue;
    if (THUMBNAIL_WIDTHS.every((width) => files.has(thumbnailName(filename, width)))) continue;
    try {
      await writeThumbnails(await fs.promises.readFile(path.join(dir, filename)), filename);
      created += 1;
    } catch (error) {
      console.error(`Thumbnail failed for ${filename}`, error);
    }
  }
  return created;
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

  await fs.promises.mkdir(uploadDir(), { recursive: true });
  const filename = `${crypto.randomUUID()}.webp`;
  await fs.promises.writeFile(path.join(uploadDir(), filename), output);
  await writeThumbnails(output, filename);
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
  const dir = uploadDir();
  const filename = path.basename(url);
  const filePath = path.resolve(dir, filename);
  if (!filePath.startsWith(`${dir}${path.sep}`)) return;
  await fs.promises.rm(filePath, { force: true });
  await Promise.all(THUMBNAIL_WIDTHS.map((width) => fs.promises.rm(path.join(dir, thumbnailName(filename, width)), { force: true })));
}
