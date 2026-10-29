// «Превью с ИИ»: what the owner can choose. The keys match the server
// (backend/src/services/previewImageService.ts), which turns them into the prompt.

import type { ProductFormImage } from "./types";

export type PreviewScene = "auto" | "studio" | "city" | "nature" | "interior" | "winter" | "beach" | "sport";
export type PreviewTheme =
  | "auto"
  | "cold"
  | "gold"
  | "premium"
  | "bright"
  | "pastel"
  | "eco"
  | "burgundy"
  | "sea"
  | "lavender"
  | "terracotta"
  | "neon";
export type PreviewFeature = "warm" | "water" | "wind" | "light" | "breath" | "strong" | "eco" | "hypo" | "size" | "fast";

export interface PreviewOptions {
  scene: PreviewScene;
  theme: PreviewTheme;
  text: "with_text" | "no_text";
  headline: string;
  /** Empty — the AI picks the benefits. */
  features: PreviewFeature[];
  showColors: boolean;
  /** The product's colors as overlapping circles in the picture's corner (drawn by the server, exact). */
  colorDots: boolean;
}

export const SCENES: { value: PreviewScene; label: string }[] = [
  { value: "auto", label: "Авто" },
  { value: "studio", label: "Студия" },
  { value: "city", label: "Город" },
  { value: "nature", label: "Природа" },
  { value: "interior", label: "Интерьер" },
  { value: "winter", label: "Зима" },
  { value: "beach", label: "Пляж" },
  { value: "sport", label: "Спорт" }
];

/** Two swatches: the headline color and the accent of labels and the badge. */
export const THEMES: { value: PreviewTheme; label: string; colors?: [string, string] }[] = [
  { value: "auto", label: "Авто" },
  { value: "cold", label: "Холодная синяя", colors: ["#1B2F6B", "#9CD3FF"] },
  { value: "gold", label: "Тёплая золотая", colors: ["#13224A", "#D9A43A"] },
  { value: "premium", label: "Премиум чёрная", colors: ["#111111", "#F2F2F2"] },
  { value: "bright", label: "Яркая", colors: ["#D62839", "#FFD23F"] },
  { value: "pastel", label: "Пастельная", colors: ["#C47A8A", "#9FDCC6"] },
  { value: "eco", label: "Эко зелёная", colors: ["#2F5D3A", "#A9C5A0"] },
  { value: "burgundy", label: "Бордовая", colors: ["#6D1A2C", "#F3E6CF"] },
  { value: "sea", label: "Морская", colors: ["#0F5257", "#3FD0C9"] },
  { value: "lavender", label: "Лавандовая", colors: ["#4B2E83", "#C9B6F2"] },
  { value: "terracotta", label: "Терракотовая", colors: ["#B5532E", "#E8CFA4"] },
  { value: "neon", label: "Неоновая", colors: ["#FF2E9A", "#1FE5FF"] }
];

export const FEATURES: { value: PreviewFeature; label: string }[] = [
  { value: "warm", label: "Тёплая" },
  { value: "water", label: "Влагозащитная" },
  { value: "wind", label: "Защита от ветра" },
  { value: "light", label: "Лёгкая и удобная" },
  { value: "breath", label: "Дышащая" },
  { value: "strong", label: "Прочная" },
  { value: "eco", label: "Эко-материалы" },
  { value: "hypo", label: "Гипоаллергенно" },
  { value: "size", label: "Все размеры" },
  { value: "fast", label: "Быстрая доставка" }
];

export const MAX_FEATURES = 4;
export const MAX_HEADLINE = 40;

const DEFAULT_OPTIONS: PreviewOptions = { scene: "auto", theme: "auto", text: "with_text", headline: "", features: [], showColors: false, colorDots: true };

// The look carries over to the next product, so the storefront stays in one style.
// The headline doesn't: it belongs to one product.
const STORAGE_KEY = "ai-preview-options";

export function readPreviewOptions(): PreviewOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PreviewOptions> | null;
    if (!saved) return DEFAULT_OPTIONS;
    return {
      ...DEFAULT_OPTIONS,
      scene: SCENES.some((scene) => scene.value === saved.scene) ? saved.scene! : "auto",
      theme: THEMES.some((theme) => theme.value === saved.theme) ? saved.theme! : "auto",
      text: saved.text === "no_text" ? "no_text" : "with_text",
      features: Array.isArray(saved.features) ? saved.features.filter((value) => FEATURES.some((feature) => feature.value === value)).slice(0, MAX_FEATURES) : [],
      showColors: Boolean(saved.showColors),
      colorDots: saved.colorDots !== false
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function savePreviewOptions({ headline: _headline, ...look }: PreviewOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

/**
 * What «Превью с ИИ» sends: the photo (a new one as a file, a saved one by its
 * address), the options and what the product is — the window and «Авто» both.
 */
export function previewRequest(
  photo: ProductFormImage,
  { colorDots, ...options }: PreviewOptions,
  product: { title: string; category: string; colors: { name: string; hex: string }[] }
) {
  const colors = [...new Set(product.colors.map((color) => color.name.trim()).filter(Boolean))];
  const formData = new FormData();
  if (photo.file) formData.append("image", photo.file);
  else formData.append("imageUrl", photo.url);
  formData.append(
    "options",
    JSON.stringify({
      ...options,
      headline: options.text === "with_text" ? options.headline.trim() : "",
      showColors: options.showColors && colors.length > 1,
      title: product.title.trim(),
      category: product.category.trim(),
      colors,
      swatches: colorDots ? [...new Set(product.colors.map((color) => color.hex))] : []
    })
  );
  return formData;
}

/** The server answers with a data: URL; CSP forbids fetch(data:), so it's decoded by hand. */
export function dataUrlToFile(dataUrl: string, name: string) {
  const [header, base64 = ""] = dataUrl.split(",");
  const type = header.match(/^data:([^;]+)/)?.[1] ?? "image/webp";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const extension = type.split("/")[1] === "jpeg" ? "jpg" : type.split("/")[1];
  return new File([bytes], `${name}.${extension}`, { type });
}
