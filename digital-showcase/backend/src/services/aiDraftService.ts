import type { ProductStatus } from "../types/models.js";

interface DraftVariant {
  colorName: string;
  colorHex: string | null;
  size: string;
  price: number | null;
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

export function createProductAiDraft(prompt: string): ProductAiDraft {
  const jsonDraft = parseJsonDraft(prompt);
  if (jsonDraft) return jsonDraft;

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

function parseJsonDraft(prompt: string) {
  const match = prompt.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Partial<ProductAiDraft>;
    return {
      title: parsed.title ?? "",
      description: parsed.description ?? null,
      price: parsed.price ?? null,
      priceText: parsed.priceText ?? null,
      category: parsed.category ?? null,
      status: parsed.status ?? "AVAILABLE",
      isVisible: parsed.isVisible ?? 1,
      sizes: parsed.sizes ?? [],
      colors: parsed.colors ?? [],
      variants: parsed.variants ?? []
    };
  } catch {
    return null;
  }
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
