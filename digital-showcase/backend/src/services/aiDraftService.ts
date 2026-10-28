import fs from "node:fs";
import path from "node:path";
import type { ProductStatus } from "../types/models.js";
import { colorHexForName, colorNamesIn, parseColorHex, resolveColorHex } from "../utils/colorHex.js";
import { HttpError } from "../utils/http.js";
import { completeJson, isAiConfigured, transcribe } from "./aiProvider.js";
import { optimizeImageForAi } from "./imageService.js";

interface DraftVariant {
  colorName: string;
  colorHex: string | null;
  size: string;
  price: number | null;
}

interface AiDraftFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/** «Вручную + ИИ»: the owner asks the AI for one field only. */
export const DRAFT_FIELDS = ["title", "description", "category", "colors"] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** What the owner already typed: the AI builds the asked field on it. */
export type KnownProductFields = Partial<Record<"title" | "description" | "category", string>>;

export interface ProductAiDraftInput {
  prompt?: string;
  /** Only this field is wanted; the others come back empty and the form ignores them. */
  field?: DraftField;
  known?: KnownProductFields;
  voice?: AiDraftFile;
  images?: AiDraftFile[];
  imageUrls?: string[];
  /** Bulk mode: how many products the owner roughly expects on the photos. */
  expectedCount?: number;
}

export interface ProductAiDraft {
  title: string;
  description: string | null;
  price: number | null;
  priceText: string | null;
  category: string | null;
  status: ProductStatus;
  isVisible: number;
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  variants: DraftVariant[];
}

export interface BulkProductAiDraft extends ProductAiDraft {
  imageIndexes: number[];
}

const productDraftInstructions = `
Ты помогаешь владельцу небольшого магазина одежды заполнить форму товара.
Верни только JSON без markdown и пояснений. В ответе обязательно должен быть JSON.
Схема:
{
  "title": "короткое название товара",
  "description": "описание для покупателя или null",
  "price": 4500 или null,
  "priceText": "Уточнить у продавца" или null,
  "category": "Платья" или null,
  "status": "AVAILABLE" | "NOT_AVAILABLE" | "CHECK_IN_STORE",
  "isVisible": 1 или 0,
  "sizes": ["S", "M"],
  "colors": [{"name":"тёмно-синий","hex":"#1f2a44"}],
  "variants": [{"colorName":"тёмно-синий","colorHex":"#1f2a44","size":"M","price":4500}]
}
hex и colorHex — всегда код цвета в формате #RRGGBB, подобранный по фото (или по названию, если фото нет), например "#1f2a44". Никогда не пиши в hex название цвета.
Не выдумывай точную цену, если ее нет в тексте или голосе. Используй null и priceText "Уточнить у продавца".
AI не принимает финальных решений: возвращай только редактируемое предложение.
`;

const fieldTasks: Record<DraftField, string> = {
  title: "Придумай только название (title): 2–5 слов, как на ценнике, например «Льняное платье миди».",
  description:
    "Напиши только описание для покупателя (description): 2–4 коротких предложения — ткань, фасон, посадка, детали, то, что видно. Без цены и размеров, без восклицаний.",
  category: "Определи только категорию (category): одно-два слова во множественном числе, например «Платья», «Брюки», «Верхняя одежда», «Обувь».",
  colors: "Определи только цвета товара (colors): те, что видны на самой вещи, а не на фоне. Названия по-русски, у каждого — hex: код #RRGGBB, как цвет выглядит на фото, а не название."
};

const knownLabels: Record<keyof KnownProductFields, string> = { title: "Название", description: "Описание", category: "Категория" };

const bulkDraftInstructions = `
Ты каталогизатор одежды.

Твоя главная задача — определить, какие фотографии относятся к одному и тому же ФИЗИЧЕСКОМУ изделию.

ВАЖНО.

Один товар может иметь несколько фотографий.

Объединяй изображения если это:

- вид спереди;
- вид сзади;
- другой ракурс;
- крупный план;
- фотография на модели;
- фотография без модели;
- фотографии одной и той же вещи.

НЕ создавай новый товар если отличается только:

- ракурс;
- поза модели;
- масштаб изображения;
- фон;
- освещение.

Также объединяй в один товар одну модель вещи в разных цветах или комплектациях. Отличия цвета, карманов и других вариантов исполнения опиши через colors и variants, а все фотографии оставь в общем imageIndexes.

Если вещь сфотографирована отдельно и на человеке, сопоставь фасон, материал, цвет, швы, карманы и другие детали. Фото человека в этой вещи относится к тому же товару. На фото с человеком каталогизируй именно одежду, наиболее похожую на вещи на остальных загруженных фотографиях.

Создавай новый товар только если это действительно другое изделие.

Если сомневаешься —
объединяй изображения.

Твоя цель —
получить минимально возможное количество товаров.

Пример.

Фото 0 — джинсы спереди

Фото 1 — джинсы сзади

Фото 2 — карман этих же джинсов

Фото 3 — футболка

Ответ:

{
 "products":[
   {
      "title":"Джинсы",
      "imageIndexes":[0,1,2]
   },
   {
      "title":"Футболка",
      "imageIndexes":[3]
   }
 ]
}

Верни только JSON.

Каждый элемент products содержит:

title,
description,
price,
priceText,
category,
status,
isVisible,
sizes,
colors,
variants,
imageIndexes.

imageIndexes — это ВСЕ фотографии одного физического товара.

Каждая фотография должна присутствовать ровно один раз.

Не выдумывай цены, размеры и цвета.
Если цена не определена, верни price=null и priceText="Уточнить у продавца".
Если размер не определен, верни sizes=["Уточнить у продавца"].
`;

export async function createProductAiDraft(input: string | ProductAiDraftInput): Promise<ProductAiDraft> {
  const draftInput = typeof input === "string" ? { prompt: input } : input;
  const prompt = draftInput.prompt?.trim() ?? "";
  // One field is always asked of the model: the local fallback has nothing to say about it.
  const hasRichInput = Boolean(draftInput.voice || draftInput.images?.length || draftInput.imageUrls?.length || draftInput.field);

  if (isAiConfigured()) {
    try {
      return await createExternalProductAiDraft(draftInput);
    } catch (error) {
      if (hasRichInput) {
        throw error instanceof HttpError ? error : new HttpError(502, "AI-провайдер не смог создать черновик товара");
      }
    }
  }

  if (hasRichInput) {
    throw new HttpError(503, "Для ИИ-черновика по фото или голосу настройте AI_API_KEY на сервере");
  }

  return createLocalProductAiDraft(prompt);
}

export async function createBulkProductAiDraft(input: ProductAiDraftInput): Promise<BulkProductAiDraft[]> {
  if (!input.images?.length) throw new HttpError(400, "Добавьте изображения товаров");
  if (!isAiConfigured()) throw new HttpError(503, "Для массовой группировки товаров настройте AI_API_KEY на сервере");

  const transcript = input.voice ? await transcribeVoice(input.voice) : "";
  const imageUrls = await collectImageInputs(input.images, []);
  const description = [input.prompt?.trim(), transcript ? `Голосовое описание: ${transcript}` : ""].filter(Boolean).join("\n\n");
  const text = `
        Перед созданием карточек сначала найди фотографии,
        относящиеся к одному физическому изделию.

        После этого создай минимальное возможное количество карточек.

        Если несколько фотографий являются одной и той же вещью,
        они ОБЯЗАНЫ попасть в один imageIndexes.

        Верни результат только в формате JSON с корневым полем products.

        Количество фотографий: ${input.images.length}
        ${input.expectedCount ? `Владелец говорит, что на фотографиях примерно ${input.expectedCount} товаров. Ориентируйся на это число, но не объединяй разные изделия ради него.` : ""}

        ${description || "Дополнительное описание отсутствует."}
        `;
  const answer = await completeJson({ instructions: `${productDraftInstructions}\n${bulkDraftInstructions}`, text, images: imageUrls });
  return normalizeBulkProductDrafts(answer, input.images.length, description);
}

export function normalizeBulkProductDrafts(rawText: string, imageCount: number, fallbackPrompt = ""): BulkProductAiDraft[] {
  const parsed = parseJsonObject(rawText);
  const products = Array.isArray(parsed?.products) ? parsed.products : [];
  const claimed = new Set<number>();
  const drafts = products.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const normalized = normalizeAiDraft(JSON.stringify(raw), fallbackPrompt);
    const sizes = normalized.sizes.length ? normalized.sizes : ["Уточнить у продавца"];
    const draft = normalized.price == null
      ? { ...normalized, sizes, priceText: "Уточнить у продавца", status: "CHECK_IN_STORE" as ProductStatus }
      : { ...normalized, sizes };
    const imageIndexes = normalizeImageIndexes(raw.imageIndexes, imageCount).filter((index) => !claimed.has(index));
    imageIndexes.forEach((index) => claimed.add(index));
    return imageIndexes.length ? [{ ...draft, imageIndexes }] : [];
  });

  const unclaimed = Array.from({ length: imageCount }, (_, index) => index).filter((index) => !claimed.has(index));
  if (unclaimed.length && drafts[0]) drafts[0].imageIndexes.push(...unclaimed);
  if (!drafts.length) throw new HttpError(502, "AI не смог сгруппировать изображения по товарам");
  return drafts;
}

async function createExternalProductAiDraft(input: ProductAiDraftInput) {
  const imageUrls = await collectImageInputs(input.images ?? [], input.imageUrls ?? []);
  if (input.field) {
    const answer = await completeJson({ instructions: productDraftInstructions, text: fieldRequestText(input.field, input.known ?? {}, imageUrls.length), images: imageUrls });
    return normalizeAiDraft(answer, "");
  }
  const transcript = input.voice ? await transcribeVoice(input.voice) : "";
  const descriptionParts = [input.prompt?.trim(), transcript ? `Голосовое описание: ${transcript}` : ""].filter(Boolean);
  const text = descriptionParts.length
    ? descriptionParts.join("\n\n")
    : // «Авто» → «Сгенерировать карточку»: only photos. Everything visible comes from them; price and sizes aren't guessed.
      "Описания от владельца нет: заполни карточку только по фотографиям. Определи по ним название, описание для покупателя (ткань, фасон, детали — что видно), категорию и цвета. Размеры указывай, только если они видны на бирке, иначе sizes=[]. Цену не придумывай: price=null.";

  const answer = await completeJson({
    instructions: productDraftInstructions,
    text: `Создай черновик карточки товара одежды в формате JSON.\n\n${text}`,
    images: imageUrls
  });
  return normalizeAiDraft(answer, [input.prompt, transcript].filter(Boolean).join("\n"));
}

/** «Вручную + ИИ»: one field from the photos and what the owner already typed. */
function fieldRequestText(field: DraftField, known: KnownProductFields, photoCount: number) {
  const typed = (Object.keys(knownLabels) as (keyof KnownProductFields)[])
    .filter((key) => key !== field && known[key]?.trim())
    .map((key) => `${knownLabels[key]}: ${known[key]!.trim()}`);
  return [
    "Владелец заполняет карточку товара одежды сам и просит помочь с одним полем.",
    fieldTasks[field],
    "Остальные поля схемы верни пустыми: null или []. Цену не придумывай: price=null.",
    photoCount ? "Опирайся на фотографии товара." : "Фото нет: опирайся на то, что владелец уже написал.",
    typed.length ? `Уже заполнено владельцем:\n${typed.join("\n")}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function transcribeVoice(file: AiDraftFile) {
  return transcribe(
    { buffer: file.buffer, mimetype: file.mimetype, filename: audioFilename(file) },
    "Описание товара одежды для цифровой витрины. Сохрани размеры, цвета, цены и категории."
  );
}

async function collectImageInputs(files: AiDraftFile[], imageUrls: string[]) {
  const optimized = await Promise.all(files.map((file) => optimizeImageForAi(file)));
  const inputs = optimized.map((buffer) => dataUrl(buffer, "image/webp"));
  for (const url of imageUrls) {
    const imageInput = await imageUrlInput(url);
    if (imageInput) inputs.push(imageInput);
  }
  return inputs.slice(0, 40);
}

function normalizeImageIndexes(value: unknown, imageCount: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < imageCount))];
}

async function imageUrlInput(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/uploads/")) return null;

  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
  const filename = path.basename(decodeURIComponent(url));
  const filePath = path.resolve(uploadDir, filename);
  if (!filePath.startsWith(`${uploadDir}${path.sep}`)) return null;
  if (!fs.existsSync(filePath)) return null;

  const buffer = await fs.promises.readFile(filePath);
  const optimized = await optimizeImageForAi({ buffer, mimetype: mimeFromFilename(filename), originalname: filename, size: buffer.length });
  return dataUrl(optimized, "image/webp");
}

function dataUrl(buffer: Buffer | Uint8Array, mimetype: string) {
  return `data:${mimetype};base64,${Buffer.from(buffer).toString("base64")}`;
}

function audioFilename(file: AiDraftFile) {
  const ext = path.extname(file.originalname).toLowerCase();
  if ([".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"].includes(ext)) return file.originalname;
  if (file.mimetype.includes("wav")) return "voice.wav";
  if (file.mimetype.includes("mpeg") || file.mimetype.includes("mp3")) return "voice.mp3";
  if (file.mimetype.includes("mp4")) return "voice.mp4";
  return "voice.webm";
}

function mimeFromFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function normalizeAiDraft(rawText: string, fallbackPrompt: string): ProductAiDraft {
  const parsed = parseJsonObject(rawText);
  if (!parsed) return createLocalProductAiDraft(fallbackPrompt);

  const price = numberOrNull(parsed.price);
  const colors = normalizeColors(parsed.colors);
  const sizes = normalizeStrings(parsed.sizes);
  let variants = normalizeDraftVariants(parsed.variants, colors);
  if (!variants.length && (colors.length || sizes.length)) {
    variants = buildVariants("", colors, sizes, price);
  }

  return {
    title: stringOrNull(parsed.title) ?? inferTitle(fallbackPrompt),
    description: stringOrNull(parsed.description) ?? (fallbackPrompt || null),
    price,
    priceText: stringOrNull(parsed.priceText) ?? (price == null ? "Уточнить у продавца" : null),
    category: stringOrNull(parsed.category),
    status: normalizeStatus(parsed.status),
    isVisible: Number(parsed.isVisible) === 0 ? 0 : 1,
    sizes,
    colors,
    variants
  };
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeStrings(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()).filter(Boolean))] : [];
}

function normalizeColors(value: unknown): { name: string; hex: string | null }[] {
  if (!Array.isArray(value)) return [];
  const colors: { name: string; hex: string | null }[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) colors.push({ name, hex: colorHexForName(name) });
      continue;
    }

    if (item && typeof item === "object") {
      const color = item as { name?: unknown; hex?: unknown };
      const name = String(color.name ?? "").trim();
      if (name) colors.push({ name, hex: resolveColorHex(color.hex, name) });
    }
  }

  return colors;
}

/** A variant without its own code takes the one its color got in `colors`. */
function normalizeDraftVariants(value: unknown, colors: { name: string; hex: string | null }[]): DraftVariant[] {
  if (!Array.isArray(value)) return [];
  const hexByName = new Map(colors.map((color) => [color.name.toLowerCase(), color.hex]));
  const variants: DraftVariant[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const variant = item as Record<string, unknown>;
    const colorName = String(variant.colorName ?? "").trim();
    const size = String(variant.size ?? "").trim();
    if (!colorName || !size) continue;
    variants.push({
      colorName,
      colorHex: parseColorHex(variant.colorHex) ?? hexByName.get(colorName.toLowerCase()) ?? resolveColorHex(variant.colorHex, colorName),
      size,
      price: numberOrNull(variant.price)
    });
  }

  return variants;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStatus(value: unknown): ProductStatus {
  return value === "NOT_AVAILABLE" || value === "CHECK_IN_STORE" || value === "AVAILABLE" ? value : "AVAILABLE";
}

function createLocalProductAiDraft(prompt: string): ProductAiDraft {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const price = findFirstPrice(lower);
  const colors = colorNamesIn(lower).map((name) => ({ name, hex: colorHexForName(name) }));
  const sizes = findSizes(normalized);
  const variants = buildVariants(lower, colors, sizes, price);

  return {
    title: inferTitle(normalized),
    description: normalized || null,
    price,
    priceText: price == null ? "Уточнить у продавца" : null,
    category: inferCategory(lower),
    status: "AVAILABLE",
    isVisible: 1,
    sizes,
    colors,
    variants
  };
}

function inferTitle(prompt: string) {
  const firstPart = prompt.split(/[.!?]/)[0]?.trim();
  return firstPart ? firstPart.slice(0, 80) : "";
}

function inferCategory(prompt: string) {
  if (/(плать|сарафан)/.test(prompt)) return "Платья";
  if (/(футболк|лонгслив|рубашк|блуз)/.test(prompt)) return "Верх";
  if (/(брюк|джинс|юбк|шорт)/.test(prompt)) return "Низ";
  if (/(пальто|куртк|жакет|пиджак)/.test(prompt)) return "Верхняя одежда";
  if (/(кроссов|ботин|туфл|обув)/.test(prompt)) return "Обувь";
  return null;
}

function findFirstPrice(prompt: string) {
  const match = prompt.match(/(\d[\d\s]{1,8})(?:\s*)(?:₽|руб|р\b)/i);
  if (!match) return null;
  return Number(match[1].replace(/\s/g, ""));
}

function findSizes(prompt: string) {
  const sizes = new Set<string>();
  const letterSizeMatches = prompt.match(/\b(?:XS|S|M|L|XL|XXL|XXXL)\b/gi) ?? [];
  for (const size of letterSizeMatches) sizes.add(size.toUpperCase());

  const numberSizeMatches = prompt.match(/\b(?:3[6-9]|4[0-9]|5[0-6])\b/g) ?? [];
  for (const size of numberSizeMatches) sizes.add(size);
  return [...sizes];
}

function buildVariants(prompt: string, colors: { name: string; hex: string | null }[], sizes: string[], fallbackPrice: number | null) {
  const safeColors = colors.length ? colors : [{ name: "Уточнить", hex: null }];
  const safeSizes = sizes.length ? sizes : ["Уточнить"];
  return safeColors.flatMap((color) =>
    safeSizes.map((size) => ({
      colorName: color.name,
      colorHex: color.hex,
      size,
      price: findNearbyPrice(prompt, color.name, size) ?? fallbackPrice
    }))
  );
}

function findNearbyPrice(prompt: string, colorName: string, size: string) {
  const colorIndex = prompt.indexOf(colorName.toLowerCase());
  const sizeIndex = prompt.toLowerCase().indexOf(size.toLowerCase());
  const start = Math.max(0, Math.min(colorIndex === -1 ? Infinity : colorIndex, sizeIndex === -1 ? Infinity : sizeIndex) - 20);
  if (!Number.isFinite(start)) return null;
  const fragment = prompt.slice(start, start + 90);
  return findFirstPrice(fragment);
}
