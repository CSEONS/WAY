// Styles of «Превью с ИИ» a new database starts with (see previewStyleService).
// The first one is the look the previews always had; the rest are hidden until
// the admin tries them on a real photo. Also the fallback when no style is on.

export interface PreviewStylePreset {
  id: string;
  name: string;
  description: string;
  /** How the picture looks: framing, background, light, mood. Goes into the prompt as written. */
  look: string;
  /** Where and how the headline, labels and icons go. Empty — the style has no text. */
  textLayout: string;
  /** The owner picks the background («Фон»); off — the look sets it. */
  usesScene: number;
  /** The owner picks the colors («Цвета оформления»). */
  usesTheme: number;
  /** The owner picks the benefit icons; only with text. */
  usesFeatures: number;
  isActive: number;
}

export const DEFAULT_PREVIEW_STYLE: PreviewStylePreset = {
  id: "advert",
  name: "Рекламная карточка",
  description: "Заголовок, бейдж и иконки преимуществ на красивом фоне",
  look:
    "The product centered, front view, studio-quality product photography, realistic texture, sharp details. " +
    "Commercial advertising style, high contrast, saturated colors, clean layout, hyperrealistic.",
  textLayout:
    "headline in bold 3D letters with a white outline and drop shadow in the top-left corner, a short subtitle on a rounded label under it, " +
    "one key benefit badge in the top-right corner, benefit icons as round icons in a column on the left side, each with a short caption.",
  usesScene: 1,
  usesTheme: 1,
  usesFeatures: 1,
  isActive: 1
};

export const PREVIEW_STYLE_PRESETS: PreviewStylePreset[] = [
  DEFAULT_PREVIEW_STYLE,
  {
    id: "catalog",
    name: "Чистый каталог",
    description: "Товар на белом фоне, без надписей — как на маркетплейсах",
    look:
      "Clean e-commerce catalog photo: the product centered, front view, on a pure white seamless background with a soft natural shadow under it, " +
      "even soft studio lighting, true-to-life colors, sharp details, nothing else in the frame.",
    textLayout: "",
    usesScene: 0,
    usesTheme: 0,
    usesFeatures: 0,
    isActive: 0
  },
  {
    id: "lifestyle",
    name: "Лайфстайл",
    description: "Товар в жизненной обстановке, как в журнале",
    look:
      "Lifestyle photo: the product placed naturally in a real-life setting where it is used, as in a magazine editorial, " +
      "shallow depth of field, natural light, warm and inviting mood, photorealistic.",
    textLayout: "",
    usesScene: 1,
    usesTheme: 0,
    usesFeatures: 0,
    isActive: 0
  },
  {
    id: "flatlay",
    name: "Раскладка сверху",
    description: "Вид сверху с подходящими аксессуарами вокруг",
    look:
      "Flat lay photo shot from directly above: the product laid out neatly in the center with a few small matching accessories and props around it, " +
      "on a textured surface, soft even daylight, minimal and balanced composition, photorealistic.",
    textLayout: "",
    usesScene: 0,
    usesTheme: 1,
    usesFeatures: 0,
    isActive: 0
  },
  {
    id: "premium",
    name: "Премиум",
    description: "Тёмный фон, драматичный свет и один изящный заголовок",
    look:
      "Premium editorial look: the product centered on a dark, moody background with dramatic rim lighting and deep shadows, " +
      "luxurious and minimal, lots of empty space, photorealistic, sharp details.",
    textLayout: "one short elegant headline in thin uppercase letters with wide letter spacing at the top, no icons or badges.",
    usesScene: 0,
    usesTheme: 0,
    usesFeatures: 0,
    isActive: 0
  }
];
