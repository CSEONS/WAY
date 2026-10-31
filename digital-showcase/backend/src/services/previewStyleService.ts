import { getDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";
import { deleteStoredImage, storeProductImage, type UploadedImage } from "./imageService.js";
import { DEFAULT_PREVIEW_STYLE } from "./previewStylePresets.js";

// Styles of «Превью с ИИ» («Стили превью» in the admin panel): how the cover
// looks and where its text goes, written for the image model. The owner picks
// one in the preview window; the parts that keep the product as on the photo
// and the storefront free of people stay in previewImageService, whatever the
// style says.

export interface PreviewStyle {
  id: string;
  name: string;
  description: string;
  /** A cover drawn in this style, for the owner to see before picking it. */
  sample: string | null;
  look: string;
  /** Empty — the style has no text. */
  textLayout: string;
  usesScene: number;
  usesTheme: number;
  usesFeatures: number;
  /** In the owner's preview window. */
  isActive: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type PreviewStyleInput = Pick<PreviewStyle, "name" | "description" | "look" | "textLayout" | "usesScene" | "usesTheme" | "usesFeatures" | "isActive">;

/** What the prompt needs of a style. */
export type PreviewStyleLook = Pick<PreviewStyle, "look" | "textLayout" | "usesScene" | "usesTheme" | "usesFeatures">;

/** Every style in the owner's order, hidden ones too. */
export async function listStyles() {
  const db = await getDb();
  return db.all<PreviewStyle>("SELECT * FROM preview_styles ORDER BY sortOrder, createdAt");
}

/** Styles in the owner's preview window, without the prompt. */
export async function ownerStyles() {
  const db = await getDb();
  const rows = await db.all<PreviewStyle>("SELECT * FROM preview_styles WHERE isActive = 1 ORDER BY sortOrder, createdAt");
  return rows.map(({ id, name, description, sample, textLayout, usesScene, usesTheme, usesFeatures }) => ({
    id,
    name,
    description,
    sample,
    hasText: Boolean(textLayout.trim()),
    usesScene: Boolean(usesScene),
    usesTheme: Boolean(usesTheme),
    usesFeatures: Boolean(usesFeatures)
  }));
}

export async function getStyle(id: string) {
  const db = await getDb();
  return (await db.get<PreviewStyle>("SELECT * FROM preview_styles WHERE id = ?", id)) ?? null;
}

/**
 * The style a preview is drawn in: the one asked for while it's on, else the
 * first one on (the owner's saved choice may have been hidden since), else
 * the original look — a preview never fails for want of a style.
 */
export async function styleForPreview(id: string): Promise<PreviewStyleLook> {
  const db = await getDb();
  const chosen = id ? await db.get<PreviewStyle>("SELECT * FROM preview_styles WHERE id = ? AND isActive = 1", id) : undefined;
  return chosen ?? (await db.get<PreviewStyle>("SELECT * FROM preview_styles WHERE isActive = 1 ORDER BY sortOrder, createdAt LIMIT 1")) ?? DEFAULT_PREVIEW_STYLE;
}

async function assertAnotherActive(id: string) {
  const db = await getDb();
  const other = await db.get<{ id: string }>("SELECT id FROM preview_styles WHERE isActive = 1 AND id != ? LIMIT 1", id);
  if (!other) throw new HttpError(400, "Это последний включённый стиль: владельцам будет не из чего выбрать. Сначала включите другой");
}

/** Creates (id null) or updates a style. */
export async function saveStyle(id: string | null, input: PreviewStyleInput) {
  const db = await getDb();
  const now = new Date().toISOString();
  let styleId = id;
  if (styleId) {
    const current = await getStyle(styleId);
    if (!current) throw new HttpError(404, "Стиль не найден");
    if (current.isActive && !input.isActive) await assertAnotherActive(styleId);
    await db.run(
      "UPDATE preview_styles SET name = ?, description = ?, look = ?, textLayout = ?, usesScene = ?, usesTheme = ?, usesFeatures = ?, isActive = ?, updatedAt = ? WHERE id = ?",
      input.name,
      input.description,
      input.look,
      input.textLayout,
      input.usesScene,
      input.usesTheme,
      input.usesFeatures,
      input.isActive,
      now,
      styleId
    );
  } else {
    styleId = crypto.randomUUID();
    const last = await db.get<{ sortOrder: number | null }>("SELECT MAX(sortOrder) as sortOrder FROM preview_styles");
    await db.run(
      `INSERT INTO preview_styles (id, name, description, look, textLayout, usesScene, usesTheme, usesFeatures, isActive, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      styleId,
      input.name,
      input.description,
      input.look,
      input.textLayout,
      input.usesScene,
      input.usesTheme,
      input.usesFeatures,
      input.isActive,
      (last?.sortOrder ?? -1) + 1,
      now,
      now
    );
  }
  return (await getStyle(styleId))!;
}

/** Owners who picked it get the first style on next time. */
export async function deleteStyle(id: string) {
  const style = await getStyle(id);
  if (!style) throw new HttpError(404, "Стиль не найден");
  if (style.isActive) await assertAnotherActive(id);
  const db = await getDb();
  await db.run("DELETE FROM preview_styles WHERE id = ?", id);
  await deleteStoredImage(style.sample);
  return style;
}

/** The owner's order: the ids as they should go. Unknown ids are ignored. */
export async function reorderStyles(ids: string[]) {
  const db = await getDb();
  for (const [index, id] of ids.entries()) await db.run("UPDATE preview_styles SET sortOrder = ? WHERE id = ?", index, id);
  return listStyles();
}

/** The sample picture: a test cover or any image the admin uploads. null — none. */
export async function setSample(id: string, file: UploadedImage | null) {
  const style = await getStyle(id);
  if (!style) throw new HttpError(404, "Стиль не найден");
  let sample: string | null = null;
  if (file) {
    try {
      sample = await storeProductImage(file);
    } catch {
      throw new HttpError(400, "Не удалось прочитать картинку. Попробуйте другую");
    }
  }
  const db = await getDb();
  await db.run("UPDATE preview_styles SET sample = ?, updatedAt = ? WHERE id = ?", sample, new Date().toISOString(), id);
  await deleteStoredImage(style.sample);
  return (await getStyle(id))!;
}
