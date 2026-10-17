import sharp from "sharp";
import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { completeJson, isAiConfigured } from "./aiProvider.js";
import { measureTokens } from "./aiUsageService.js";

// Photos must not show living beings: people, animals, their faces — alive,
// on prints, drawings or toys, and faces of mannequins and dolls. Every
// uploaded product photo and logo is checked by the AI model; a photo where
// it finds any goes to moderation and buyers don't see it until a moderator
// (the admin, for now) approves it. Previews drawn by AI get the faces
// covered with marker strokes before the owner even sees them.

/** Part of a picture, in fractions of its width and height (0–1). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LivingBeings {
  /** Short Russian descriptions: «лицо человека», «кот на принте». Empty — nothing found. */
  found: string[];
  /** Faces or heads to cover. */
  faces: Box[];
}

export type ImageKind = "PRODUCT" | "LOGO";
export type ModerationStatus = "PENDING" | "APPROVED" | "REJECTED";

const INSTRUCTIONS = `Ты проверяешь фото для витрины магазина одежды. Найди на изображении живых существ: людей и животных (включая птиц, рыб и насекомых) — настоящих или изображённых на фото, рисунках, принтах и вышивке на одежде, игрушках, а также лица и головы манекенов и кукол. Части тела человека (руки, ноги, силуэт) тоже считаются. Растения не считаются.
Ответ — только JSON-объект:
{"found": ["коротко по-русски, что найдено, например «лицо человека», «кот на принте футболки»"], "faces": [{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.25}]}
faces — прямоугольники лиц или голов всех найденных существ: x и y — левый верхний угол, все числа — доли от ширины и высоты изображения (от 0 до 1). Если никого нет — {"found": [], "faces": []}.`;

function fraction(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

/** The model's answer, made safe: short strings and boxes inside the picture. */
export function parseLivingBeings(answer: string): LivingBeings {
  let data: unknown;
  try {
    data = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
  } catch {
    throw new Error("ИИ ответил не JSON-объектом");
  }
  const raw = (data && typeof data === "object" ? data : {}) as { found?: unknown; faces?: unknown };
  const found = (Array.isArray(raw.found) ? raw.found : [])
    .map((item) => String(item).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);
  const faces: Box[] = [];
  for (const item of Array.isArray(raw.faces) ? raw.faces : []) {
    const box = (item ?? {}) as Record<string, unknown>;
    const [x, y, width, height] = [fraction(box.x), fraction(box.y), fraction(box.width), fraction(box.height)];
    if (x == null || y == null || !width || !height) continue;
    faces.push({ x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) });
  }
  // A face without words still means someone is there.
  return { found: found.length || !faces.length ? found : ["лицо"], faces: faces.slice(0, 20) };
}

/**
 * Asks the AI model who is on the picture. Null when AI isn't configured.
 * The check is the service's own cost, not the owner's: its tokens are kept
 * out of the request that called it (a nested measureTokens).
 */
export async function findLivingBeings(image: Buffer): Promise<LivingBeings | null> {
  if (!isAiConfigured()) return null;
  const small = await sharp(image, { failOn: "error" }).rotate().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  const { result } = await measureTokens(() =>
    completeJson({
      instructions: INSTRUCTIONS,
      text: "Кто изображён на этой картинке? Ответь JSON.",
      images: [`data:image/jpeg;base64,${small.toString("base64")}`]
    })
  );
  return parseLivingBeings(result);
}

/**
 * Marker strokes over each box: a zigzag of thick rounded lines, close enough
 * to overlap, so nothing of the face shows through. Boxes get some margin.
 */
export function markerSvg(width: number, height: number, boxes: Box[]) {
  const paths = boxes.map((box) => {
    const padX = box.width * 0.15;
    const padY = box.height * 0.15;
    const left = Math.max(0, (box.x - padX) * width);
    const top = Math.max(0, (box.y - padY) * height);
    const right = Math.min(width, (box.x + box.width + padX) * width);
    const bottom = Math.min(height, (box.y + box.height + padY) * height);
    const lines = Math.max(3, Math.round((bottom - top) / Math.max(12, (right - left) / 4)));
    const step = (bottom - top) / lines;
    const points: string[] = [];
    for (let line = 0; line < lines; line += 1) {
      const y = top + step * (line + 0.5);
      points.push(line % 2 ? `${right} ${y} ${left} ${y}` : `${left} ${y} ${right} ${y}`);
    }
    return `<path d="M ${points.join(" L ")}" fill="none" stroke="#17171c" stroke-width="${step * 1.7}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${paths.join("")}</svg>`;
}

/** Covers the boxes with marker strokes. Returns WebP. */
export async function coverWithMarker(image: Buffer, boxes: Box[]) {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height || !boxes.length) return image;
  return sharp(image)
    .composite([{ input: Buffer.from(markerSvg(width, height, boxes)) }])
    .webp({ quality: 90 })
    .toBuffer();
}

export interface ImageRef {
  url: string;
  kind: ImageKind;
  storeId: string;
  productId?: string | null;
}

/**
 * Checks an uploaded photo or logo; when living beings are found, it waits
 * for moderation. Runs after the upload has answered, so failures are only
 * logged: the photo stays as it is.
 */
export async function checkImage(ref: ImageRef, image: Buffer) {
  try {
    const result = await findLivingBeings(image);
    if (!result?.found.length) return null;
    const db = await getDb();
    await db.run(
      `INSERT INTO image_checks (id, url, kind, storeId, productId, status, findings, createdAt) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
       ON CONFLICT(url) DO UPDATE SET status = 'PENDING', findings = excluded.findings, reviewedBy = NULL, reviewedAt = NULL`,
      crypto.randomUUID(),
      ref.url,
      ref.kind,
      ref.storeId,
      ref.productId ?? null,
      result.found.join(", "),
      new Date().toISOString()
    );
    return result;
  } catch (error) {
    console.error(`Image check failed for ${ref.url}:`, error);
    return null;
  }
}

/** SQL condition: the image at `column` may be shown to buyers (not waiting for moderation, not rejected). */
export function visibleToBuyers(column: string) {
  return `NOT EXISTS (SELECT 1 FROM image_checks c WHERE c.url = ${column} AND c.status IN ('PENDING', 'REJECTED'))`;
}

/** The store's logo for buyers: hidden while it waits for moderation or after a rejection. */
export async function publicLogo(logoUrl: string | null) {
  if (!logoUrl) return null;
  const db = await getDb();
  const check = await db.get<{ status: ModerationStatus }>("SELECT status FROM image_checks WHERE url = ?", logoUrl);
  return check && check.status !== "APPROVED" ? null : logoUrl;
}

/** Moderation of the given images, for the owner's own view: url → status and what was found. */
export async function moderationOf(urls: string[]) {
  if (!urls.length) return new Map<string, { status: ModerationStatus; findings: string }>();
  const db = await getDb();
  const rows = await db.all<{ url: string; status: ModerationStatus; findings: string }>(
    `SELECT url, status, findings FROM image_checks WHERE url IN (${urls.map(() => "?").join(", ")})`,
    urls
  );
  return new Map(rows.map((row) => [row.url, { status: row.status, findings: row.findings }]));
}

/** A replaced logo or a deleted photo needs no moderation any more. */
export async function forgetImage(url: string | null | undefined) {
  if (!url) return;
  const db = await getDb();
  await db.run("DELETE FROM image_checks WHERE url = ?", url);
}

export interface ImageCheck {
  id: string;
  url: string;
  kind: ImageKind;
  status: ModerationStatus;
  findings: string;
  createdAt: string;
  reviewedAt: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  productId: string | null;
  productTitle: string | null;
}

/** Images for the moderation page, newest first; only those still in use. */
export async function listChecks(status: ModerationStatus, limit = 200) {
  const db = await getDb();
  return db.all<ImageCheck>(
    `SELECT c.id, c.url, c.kind, c.status, c.findings, c.createdAt, c.reviewedAt, s.id as storeId, s.name as storeName, s.slug as storeSlug,
            p.id as productId, p.title as productTitle
     FROM image_checks c
     JOIN stores s ON s.id = c.storeId
     LEFT JOIN products p ON p.id = c.productId
     WHERE c.status = ?
       AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))
     ORDER BY c.createdAt DESC LIMIT ?`,
    status,
    limit
  );
}

export async function countPending() {
  const db = await getDb();
  const row = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM image_checks c JOIN stores s ON s.id = c.storeId
     WHERE c.status = 'PENDING' AND (c.kind = 'LOGO' AND s.logoUrl = c.url OR c.kind = 'PRODUCT' AND EXISTS (SELECT 1 FROM product_images i WHERE i.url = c.url))`
  );
  return row?.count ?? 0;
}

/** «Показывать» or «Скрыть»: the moderator's decision. */
export async function review(id: string, status: "APPROVED" | "REJECTED", reviewerId: string) {
  const db = await getDb();
  const check = await db.get<{ id: string; storeId: string }>("SELECT id, storeId FROM image_checks WHERE id = ?", id);
  if (!check) throw new HttpError(404, "Фото на проверке не найдено");
  await db.run("UPDATE image_checks SET status = ?, reviewedBy = ?, reviewedAt = ? WHERE id = ?", status, reviewerId, new Date().toISOString(), id);
  return check;
}
