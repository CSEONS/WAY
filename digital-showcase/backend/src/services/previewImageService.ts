import sharp from "sharp";
import { z } from "zod";
import { HttpError } from "../utils/http.js";
import { parseBody } from "../utils/validation.js";
import { editImage } from "./aiProvider.js";
import { coverWithMarker, findLivingBeings } from "./imageModerationService.js";
import type { UploadedImage } from "./imageService.js";

// «Превью с ИИ» in the product form: the owner's photo turned into a storefront
// cover — the same product on a nicer scene, with a headline and benefit icons
// if wanted. Ported from the «Генератор карточек товара» template (its simple
// mode): the owner only picks presets and the prompt is assembled here, so the
// paid image model only ever draws covers of the owner's own product.

interface Scene {
  bg: string;
  light: string;
  fg?: string;
}

export const SCENES = {
  auto: null,
  studio: { bg: "seamless gradient studio backdrop", light: "softbox studio lighting" },
  city: { bg: "modern city street with softly blurred buildings", light: "soft overcast light" },
  nature: { bg: "green meadow at the edge of a forest", light: "warm golden hour light" },
  interior: { bg: "cozy modern living room interior", light: "warm window light" },
  winter: { bg: "snowy mountains with pine trees, snow-covered wooden steps in the foreground", light: "bright cold daylight", fg: "light falling snow" },
  beach: { bg: "sandy beach with turquoise sea", light: "bright summer sun" },
  sport: { bg: "stadium running track", light: "dynamic high-contrast light" }
} satisfies Record<string, Scene | null>;

interface Theme {
  head: string;
  accent: string;
  sub: string;
  icon: string;
  mood: string;
}

export const THEMES = {
  auto: null,
  cold: { head: "deep navy blue", accent: "frosted ice-blue", sub: "gold", icon: "dark navy circles with silver rim", mood: "cold" },
  gold: { head: "dark navy", accent: "gold", sub: "gold", icon: "black circles with gold rim", mood: "warm" },
  premium: { head: "black", accent: "white", sub: "black", icon: "minimal white line icons on black circles", mood: "neutral" },
  bright: { head: "bright red", accent: "yellow", sub: "yellow", icon: "colorful flat circles", mood: "warm" },
  pastel: { head: "dusty pink", accent: "mint", sub: "mint", icon: "soft pastel circles", mood: "neutral" }
} satisfies Record<string, Theme | null>;

/** Benefit → [icon for the model, caption on the picture]. */
export const FEATURES = {
  warm: ["snowflake", "Тёплая"],
  water: ["water drop", "Влагозащитная"],
  wind: ["wind lines", "Защита от ветра"],
  light: ["feather", "Лёгкая и удобная"],
  breath: ["airflow waves", "Дышащая"],
  strong: ["shield", "Прочная"],
  eco: ["green leaf", "Эко-материалы"],
  hypo: ["heart", "Гипоаллергенно"],
  size: ["ruler", "Все размеры"],
  fast: ["delivery truck", "Быстрая доставка"]
} satisfies Record<string, [icon: string, caption: string]>;

type SceneKey = keyof typeof SCENES;
type ThemeKey = keyof typeof THEMES;
type FeatureKey = keyof typeof FEATURES;
const keys = <T extends string>(map: Record<T, unknown>) => Object.keys(map) as [T, ...T[]];

const previewOptionsSchema = z.object({
  scene: z.enum(keys<SceneKey>(SCENES)).default("auto"),
  theme: z.enum(keys<ThemeKey>(THEMES)).default("auto"),
  /** with_text — headline, badge and benefit icons; no_text — just the product in the scene. */
  text: z.enum(["with_text", "no_text"]).default("with_text"),
  /** Empty — the AI writes the headline. */
  headline: z.string().trim().max(40).default(""),
  /** Empty — the AI picks 3–4 benefits that fit the product. */
  features: z.array(z.enum(keys<FeatureKey>(FEATURES))).max(4).default([]),
  /** Show every color of the product side by side instead of the one on the photo. */
  showColors: z.boolean().default(false),
  title: z.string().trim().max(120).default(""),
  category: z.string().trim().max(60).default(""),
  colors: z.array(z.string().trim().max(40)).max(10).default([])
});

export type PreviewOptions = z.infer<typeof previewOptionsSchema>;

/** Options arrive as one JSON field next to the photo (multipart). */
export function parsePreviewOptions(raw: unknown) {
  let value: unknown = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Настройки превью: неверный формат");
    }
  }
  return parseBody(previewOptionsSchema, value);
}

const NUMBERS = ["zero", "one", "two", "three", "four"];
const QUANTITY = ["", "a single", "two", "three", "four", "five", "six"];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Owner's words go inside quotes in the prompt: no quotes or line breaks of their own. */
const clean = (text: string) => text.replace(/["«»“”\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** The prompt for the image model. Image 1 is always the owner's photo of the product. */
export function buildPreviewPrompt(options: PreviewOptions) {
  const scene: Scene | null = SCENES[options.scene];
  const theme: Theme | null = THEMES[options.theme];
  const withText = options.text === "with_text";
  const autos: string[] = [];
  const title = clean(options.title);
  const category = clean(options.category);
  const colors = [...new Set(options.colors.map(clean).filter(Boolean))].slice(0, 6);
  const showColors = options.showColors && colors.length > 1;

  const lines = [
    "Vertical product cover for an online store catalog, 4:5 aspect ratio.",
    "Image 1 is a photo of the product being sold: reproduce this exact product closely, keeping its shape, colors, materials, pattern and details. Do not redesign it."
  ];

  const name = title ? ` ("${title}"${category ? `, ${category}` : ""})` : "";
  lines.push(
    `Product: the exact product from Image 1${name}` +
      (showColors ? `, shown as ${QUANTITY[colors.length]} color variants side by side: ${colors.join(", ")}` : ", centered, front view") +
      ", studio-quality product photography, realistic texture, sharp details."
  );

  if (scene) lines.push(`Background: ${scene.bg}, ${scene.light}${scene.fg ? `, ${scene.fg}` : ""}.`);
  else autos.push("background scene and lighting");

  if (withText) {
    const headline = clean(options.headline);
    lines.push(
      headline
        ? `Headline text "${headline}" exactly as written, a short Russian subtitle and one key benefit badge in Russian, all fitting the product.`
        : "Write a short catchy headline in Russian, a short Russian subtitle and one key benefit badge in Russian, all fitting the product."
    );
    lines.push(
      `Headline: bold 3D text${theme ? ` in ${theme.head}` : ""}, white outline, drop shadow, top-left corner. ` +
        `Subtitle on a${theme ? ` ${theme.sub}` : ""} rounded label. Badge in the top-right corner${theme ? `, ${theme.accent}` : ""}.`
    );

    const iconStyle = theme ? `, ${theme.icon}` : "";
    if (!theme) autos.push("color palette and icon style");
    const features = options.features.map((key) => FEATURES[key]);
    lines.push(
      features.length
        ? `${capitalize(NUMBERS[features.length])} round icons on the left side${iconStyle}: ${features.map(([icon, caption]) => `${icon} icon with caption "${caption}"`).join(", ")}.`
        : `3–4 round icons on the left side${iconStyle}, each showing one of the product's most relevant benefits with a short Russian caption.`
    );
    lines.push("Keep all text and icons well inside the frame, away from the edges, and spell the Russian words correctly.");
  } else {
    lines.push("No text, letters, numbers, icons or badges anywhere in the image: only the product in the scene.");
    if (!theme) autos.push("color mood");
  }

  lines.push(`Commercial advertising style${theme ? `, ${theme.mood} color mood` : ""}, high contrast, saturated colors, clean layout, hyperrealistic.`);
  if (autos.length) lines.push(`Choose automatically whatever fits the product best: ${autos.join(", ")}.`);

  const avoid = ["brand logos", "watermarks", "distorted text", "misspelled letters", "blurry product", "low quality", "changes to the product's design, color or proportions", "unrelated extra objects"];
  // No living beings on the storefront (see imageModerationService): show worn items on an invisible mannequin or laid flat.
  lines.push("Show no people, body parts, animals or other living beings, and no faces of mannequins or dolls: if the photo has the item on a person, show it on an invisible (ghost) mannequin or laid flat.");
  avoid.push("people", "faces", "hands", "animals", "birds", "mannequin heads");
  if (!withText) avoid.push("any text", "letters", "numbers");
  lines.push(`Avoid: ${avoid.join(", ")}.`);
  return lines.join("\n");
}

/**
 * Draws the cover. Returns it as a data: URL; it becomes a product photo only
 * when the owner saves the product. Living beings the model drew anyway get
 * their faces covered with marker strokes (`livingBeings` says who was found); if the
 * picture can't be checked, it isn't shown at all.
 */
export async function createProductPreview(options: PreviewOptions, photo: UploadedImage) {
  let reference: Buffer;
  try {
    // Big enough for the model to keep the details, small enough to send fast.
    reference = await sharp(photo.buffer, { failOn: "error" })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new HttpError(400, "Не удалось прочитать фото товара. Попробуйте другое фото");
  }
  const { base64, mimetype } = await editImage({
    prompt: buildPreviewPrompt(options),
    images: [{ buffer: reference, mimetype: "image/jpeg", filename: "product.jpg" }]
  });
  const drawn = Buffer.from(base64, "base64");
  let beings: Awaited<ReturnType<typeof findLivingBeings>>;
  try {
    beings = await findLivingBeings(drawn);
  } catch {
    throw new HttpError(502, "Не удалось проверить превью на лица и живых существ — нажмите «Нарисовать ещё»");
  }
  if (!beings?.faces.length) return { image: `data:${mimetype};base64,${base64}`, livingBeings: beings?.found ?? [] };
  const covered = await coverWithMarker(drawn, beings.faces);
  return { image: `data:image/webp;base64,${covered.toString("base64")}`, livingBeings: beings.found };
}
