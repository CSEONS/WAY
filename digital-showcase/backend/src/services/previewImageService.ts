import sharp from "sharp";
import { z } from "zod";
import { parseColorHex } from "../utils/colorHex.js";
import { HttpError } from "../utils/http.js";
import { parseBody } from "../utils/validation.js";
import { editImage } from "./aiProvider.js";
import { findLivingBeings } from "./imageModerationService.js";
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
  pastel: { head: "dusty pink", accent: "mint", sub: "mint", icon: "soft pastel circles", mood: "neutral" },
  eco: { head: "deep forest green", accent: "sage green", sub: "warm beige", icon: "beige circles with forest-green line icons", mood: "natural" },
  burgundy: { head: "deep burgundy", accent: "cream", sub: "burgundy", icon: "burgundy circles with cream line icons", mood: "rich warm" },
  sea: { head: "deep teal", accent: "turquoise", sub: "white", icon: "turquoise circles with white line icons", mood: "fresh" },
  lavender: { head: "deep violet", accent: "lavender", sub: "silver", icon: "lavender circles with violet line icons", mood: "soft" },
  terracotta: { head: "terracotta", accent: "sand", sub: "terracotta", icon: "sand-colored circles with terracotta line icons", mood: "earthy warm" },
  neon: { head: "hot pink", accent: "electric cyan", sub: "black", icon: "glowing neon circles on a dark background", mood: "vibrant" }
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
  colors: z.array(z.string().trim().max(40)).max(10).default([]),
  /** The product's colors as codes: drawn as overlapping circles in the bottom-right corner. Empty — none. */
  swatches: z.array(z.string().trim().max(30)).max(10).default([])
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
    if (swatchCodes(options).length) lines.push("Keep the bottom-right corner free of text, icons and badges.");
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

/** The swatch codes that are real colors, in order, without repeats. */
function swatchCodes(options: PreviewOptions) {
  return [...new Set(options.swatches.map(parseColorHex).filter((code): code is string => code !== null))].slice(0, MAX_SWATCHES);
}

const MAX_SWATCHES = 8;

/**
 * The product's colors on the cover: circles in the bottom-right corner, each
 * over the one before, with a white rim and a soft shadow so they show on any
 * background. Drawn here, not by the model: the colors come out exactly as in
 * the card. Codes are #rrggbb (parseColorHex), so nothing else gets into the SVG.
 */
export async function drawColorSwatches(picture: Buffer, codes: string[]) {
  const { width = 0, height = 0 } = await sharp(picture).metadata();
  if (!codes.length || !width || !height) return picture;
  const size = Math.round(width * 0.075);
  const step = Math.round(size * 0.62);
  const rim = Math.max(2, Math.round(size * 0.07));
  const margin = Math.round(width * 0.045);
  const radius = size / 2;
  const left = width - margin - size - step * (codes.length - 1);
  const top = height - margin - size;
  const circles = codes
    .map((code, index) => `<circle cx="${left + radius + step * index}" cy="${top + radius}" r="${radius - rim / 2}" fill="${code}" stroke="#ffffff" stroke-width="${rim}" filter="url(#shadow)"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${rim}" stdDeviation="${rim}" flood-color="#000000" flood-opacity="0.25"/></filter></defs>${circles}</svg>`;
  return sharp(picture)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toBuffer();
}

/**
 * Draws the cover. Returns it as a data: URL; it becomes a product photo only
 * when the owner saves the product. `livingBeings` — who the model drew
 * anyway: nothing is painted over, the product goes to moderation when saved
 * (the form sends this list with the photo). If the check fails, the list is
 * empty and the photo is checked again on upload.
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
  const codes = swatchCodes(options);
  const picture = codes.length ? await drawColorSwatches(Buffer.from(base64, "base64"), codes) : Buffer.from(base64, "base64");
  const beings = await findLivingBeings(picture).catch(() => null);
  return { image: `data:${codes.length ? "image/webp" : mimetype};base64,${picture.toString("base64")}`, livingBeings: beings?.found ?? [] };
}
