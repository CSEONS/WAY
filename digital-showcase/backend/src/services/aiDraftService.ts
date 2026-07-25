import fs from "node:fs";
import path from "node:path";
import type { ProductStatus } from "../types/models.js";
import { HttpError } from "../utils/http.js";
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

export interface ProductAiDraftInput {
  prompt?: string;
  voice?: AiDraftFile;
  images?: AiDraftFile[];
  imageUrls?: string[];
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

const colorHexByName: Record<string, string> = {
  белый: "#ffffff",
  белая: "#ffffff",
  белое: "#ffffff",
  черный: "#000000",
  черная: "#000000",
  черное: "#000000",
  синий: "#2779a7",
  синяя: "#2779a7",
  синее: "#2779a7",
  голубой: "#49c5b6",
  красный: "#d92d20",
  красная: "#d92d20",
  зеленый: "#12b76a",
  зеленая: "#12b76a",
  желтый: "#ecd06f",
  желтая: "#ecd06f",
  серый: "#667085",
  серая: "#667085",
  бежевый: "#d6bb98",
  розовый: "#ee46bc"
};

const colorAliases: Record<string, string> = {
  белая: "белый",
  белое: "белый",
  черная: "черный",
  черное: "черный",
  синяя: "синий",
  синее: "синий",
  красная: "красный",
  зеленая: "зеленый",
  желтая: "желтый",
  серая: "серый"
};

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
  "colors": [{"name":"синий","hex":"#2779a7"}],
  "variants": [{"colorName":"синий","colorHex":"#2779a7","size":"M","price":4500}]
}
Не выдумывай точную цену, если ее нет в тексте или голосе. Используй null и priceText "Уточнить у продавца".
AI не принимает финальных решений: возвращай только редактируемое предложение.
`;

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
  const hasRichInput = Boolean(draftInput.voice || draftInput.images?.length || draftInput.imageUrls?.length);

  if (openAiApiKey()) {
    try {
      return await createExternalProductAiDraft(draftInput);
    } catch (error) {
      if (hasRichInput) {
        throw error instanceof HttpError ? error : new HttpError(502, "AI-провайдер не смог создать черновик товара");
      }
    }
  }

  if (hasRichInput) {
    throw new HttpError(503, "Для AI-черновика по изображениям или голосу настройте OPENAI_API_KEY на сервере");
  }

  return createLocalProductAiDraft(prompt);
}

export async function createBulkProductAiDraft(input: ProductAiDraftInput): Promise<BulkProductAiDraft[]> {
  if (!input.images?.length) throw new HttpError(400, "Добавьте изображения товаров");
  if (!openAiApiKey()) throw new HttpError(503, "Для массовой группировки товаров настройте OPENAI_API_KEY на сервере");

  const transcript = input.voice ? await transcribeVoice(input.voice) : "";
  const imageUrls = await collectImageInputs(input.images, []);
  const description = [input.prompt?.trim(), transcript ? `Голосовое описание: ${transcript}` : ""].filter(Boolean).join("\n\n");
  const content = [
    {
      type: "input_text",
      text: `
        Перед созданием карточек сначала найди фотографии,
        относящиеся к одному физическому изделию.

        После этого создай минимальное возможное количество карточек.

        Если несколько фотографий являются одной и той же вещью,
        они ОБЯЗАНЫ попасть в один imageIndexes.

        Верни результат только в формате JSON с корневым полем products.

        Количество фотографий: ${input.images.length}

        ${description || "Дополнительное описание отсутствует."}
        `
    },
    ...imageUrls.map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "low" }))
  ];
  const response = await fetch(`${openAiBaseUrl()}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      instructions: `${productDraftInstructions}\n${bulkDraftInstructions}`,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
      store: false
    }),
    signal: AbortSignal.timeout(openAiTimeoutMs())
  });

  const payload = await readOpenAiPayload(response);
  return normalizeBulkProductDrafts(extractResponseText(payload), input.images.length, description);
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
  const transcript = input.voice ? await transcribeVoice(input.voice) : "";
  const imageUrls = await collectImageInputs(input.images ?? [], input.imageUrls ?? []);
  const descriptionParts = [input.prompt?.trim(), transcript ? `Голосовое описание: ${transcript}` : ""].filter(Boolean);
  const text = descriptionParts.length ? descriptionParts.join("\n\n") : "Описание товара не задано. Используй изображения, если они приложены.";

  const content = [
    { type: "input_text", text: `Создай черновик карточки товара одежды в формате JSON.\n\n${text}` },
    ...imageUrls.map((imageUrl) => ({ type: "input_image", image_url: imageUrl, detail: "low" }))
  ];

  const response = await fetch(`${openAiBaseUrl()}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      instructions: productDraftInstructions,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
      store: false
    }),
    signal: AbortSignal.timeout(openAiTimeoutMs())
  });

  const payload = await readOpenAiPayload(response);
  return normalizeAiDraft(extractResponseText(payload), [input.prompt, transcript].filter(Boolean).join("\n"));
}

async function transcribeVoice(file: AiDraftFile) {
  const formData = new FormData();
  const filename = audioFilename(file);
  formData.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "audio/webm" }), filename);
  formData.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  formData.append("response_format", "text");
  formData.append("prompt", "Описание товара одежды для цифровой витрины. Сохрани размеры, цвета, цены и категории.");

  const response = await fetch(`${openAiBaseUrl()}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey()}` },
    body: formData,
    signal: AbortSignal.timeout(openAiTimeoutMs())
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new HttpError(502, openAiErrorMessage(body));
  return typeof body === "string" ? body : String(body.text ?? "");
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

async function readOpenAiPayload(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(502, openAiErrorMessage(payload));
  return payload;
}

function openAiErrorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) return `AI-провайдер вернул ошибку: ${error.message}`;
  }
  if (typeof payload === "string" && payload.trim()) return `AI-провайдер вернул ошибку: ${payload.trim()}`;
  return "AI-провайдер временно недоступен";
}

function extractResponseText(payload: unknown) {
  if (payload && typeof payload === "object" && "output_text" in payload && typeof (payload as { output_text?: unknown }).output_text === "string") {
    return (payload as { output_text: string }).output_text;
  }

  const parts: string[] = [];
  const output = payload && typeof payload === "object" && "output" in payload ? (payload as { output?: unknown[] }).output : [];
  for (const item of output ?? []) {
    const content = item && typeof item === "object" && "content" in item ? (item as { content?: unknown[] }).content : [];
    for (const block of content ?? []) {
      if (block && typeof block === "object" && "text" in block && typeof (block as { text?: unknown }).text === "string") {
        parts.push((block as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
}

function normalizeAiDraft(rawText: string, fallbackPrompt: string): ProductAiDraft {
  const parsed = parseJsonObject(rawText);
  if (!parsed) return createLocalProductAiDraft(fallbackPrompt);

  const price = numberOrNull(parsed.price);
  const colors = normalizeColors(parsed.colors);
  const sizes = normalizeStrings(parsed.sizes);
  let variants = normalizeDraftVariants(parsed.variants);
  if (!variants.length && (colors.length || sizes.length)) {
    variants = buildVariants("", colors.map((color) => color.name), sizes, price);
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
      if (name) colors.push({ name, hex: colorHexByName[name.toLowerCase()] ?? null });
      continue;
    }

    if (item && typeof item === "object") {
      const color = item as { name?: unknown; hex?: unknown };
      const name = String(color.name ?? "").trim();
      if (name) colors.push({ name, hex: typeof color.hex === "string" && color.hex.trim() ? color.hex.trim() : colorHexByName[name.toLowerCase()] ?? null });
    }
  }

  return colors;
}

function normalizeDraftVariants(value: unknown): DraftVariant[] {
  if (!Array.isArray(value)) return [];
  const variants: DraftVariant[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const variant = item as Record<string, unknown>;
    const colorName = String(variant.colorName ?? "").trim();
    const size = String(variant.size ?? "").trim();
    if (!colorName || !size) continue;
    variants.push({
      colorName,
      colorHex: stringOrNull(variant.colorHex) ?? colorHexByName[colorName.toLowerCase()] ?? null,
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

function openAiApiKey() {
  return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
}

function openAiBaseUrl() {
  return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function openAiTimeoutMs() {
  const value = Number(process.env.OPENAI_TIMEOUT_MS ?? 45000);
  return Number.isFinite(value) && value > 0 ? value : 45000;
}

function createLocalProductAiDraft(prompt: string): ProductAiDraft {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  const lower = normalized.toLowerCase();
  const price = findFirstPrice(lower);
  const colors = findColors(lower);
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
    colors: colors.map((name) => ({ name, hex: colorHexByName[name] ?? null })),
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

function findColors(prompt: string) {
  const colors = new Set<string>();
  for (const rawName of Object.keys(colorHexByName)) {
    if (new RegExp(`\\b${rawName}\\b`, "i").test(prompt)) colors.add(colorAliases[rawName] ?? rawName);
  }
  return [...colors];
}

function findSizes(prompt: string) {
  const sizes = new Set<string>();
  const letterSizeMatches = prompt.match(/\b(?:XS|S|M|L|XL|XXL|XXXL)\b/gi) ?? [];
  for (const size of letterSizeMatches) sizes.add(size.toUpperCase());

  const numberSizeMatches = prompt.match(/\b(?:3[6-9]|4[0-9]|5[0-6])\b/g) ?? [];
  for (const size of numberSizeMatches) sizes.add(size);
  return [...sizes];
}

function buildVariants(prompt: string, colors: string[], sizes: string[], fallbackPrice: number | null) {
  const safeColors = colors.length ? colors : ["Уточнить"];
  const safeSizes = sizes.length ? sizes : ["Уточнить"];
  return safeColors.flatMap((colorName) =>
    safeSizes.map((size) => ({
      colorName,
      colorHex: colorHexByName[colorName] ?? null,
      size,
      price: findNearbyPrice(prompt, colorName, size) ?? fallbackPrice
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
