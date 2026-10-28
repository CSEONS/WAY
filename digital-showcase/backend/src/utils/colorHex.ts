// Swatch codes for product colors. The AI is asked for a hex next to every
// color name, but it sometimes answers with the name itself («тёмно-синий»),
// a short code or rgb(), or leaves it out. Here any of that becomes #rrggbb,
// or the code is picked by the name: «тёмно-синий» is a darker «синий».

/** Dictionary forms; words are matched by stem, so «синяя», «сине-» and «синие» are «синий». Basic ones match the form's chips. */
const NAMED_COLORS: [name: string, hex: string][] = [
  ["черный", "#1a1a1a"],
  ["белый", "#ffffff"],
  ["серый", "#9ca3af"],
  ["бежевый", "#d6bb98"],
  ["коричневый", "#7c4a2d"],
  ["красный", "#dc2626"],
  ["бордовый", "#7f1d1d"],
  ["бордо", "#7f1d1d"],
  ["розовый", "#ec4899"],
  ["оранжевый", "#ea580c"],
  ["желтый", "#f59e0b"],
  ["зеленый", "#16a34a"],
  ["хаки", "#6b6b3a"],
  ["голубой", "#7dd3fc"],
  ["синий", "#2563eb"],
  ["фиолетовый", "#7c3aed"],
  ["белоснежный", "#fffafa"],
  ["молочный", "#f3ead8"],
  ["кремовый", "#f2e3c6"],
  ["сливочный", "#f4e8cf"],
  ["айвори", "#fffff0"],
  ["экрю", "#e9dcc0"],
  ["песочный", "#d2b48c"],
  ["кэмел", "#c19a6b"],
  ["кемел", "#c19a6b"],
  ["карамельный", "#c68e3f"],
  ["горчичный", "#d4a017"],
  ["оливковый", "#708238"],
  ["мятный", "#98d8c8"],
  ["бирюзовый", "#30b5b2"],
  ["изумрудный", "#047857"],
  ["салатовый", "#9acd32"],
  ["лимонный", "#fde047"],
  ["персиковый", "#f9b998"],
  ["коралловый", "#f87171"],
  ["терракотовый", "#c2603e"],
  ["рыжий", "#d2691e"],
  ["медный", "#b87333"],
  ["шоколадный", "#4e2a1e"],
  ["кофейный", "#6f4e37"],
  ["графитовый", "#3f3f46"],
  ["антрацитовый", "#2f3437"],
  ["пепельный", "#b2b5b9"],
  ["серебристый", "#c0c0c0"],
  ["серебряный", "#c0c0c0"],
  ["золотой", "#d4af37"],
  ["золотистый", "#d4af37"],
  ["бронзовый", "#a97142"],
  ["малиновый", "#be185d"],
  ["вишневый", "#7f1d3a"],
  ["винный", "#722f37"],
  ["марсала", "#964f4c"],
  ["фуксия", "#d946ef"],
  ["пудровый", "#e8c4c0"],
  ["лиловый", "#a78bfa"],
  ["сиреневый", "#c4a3d9"],
  ["лавандовый", "#b4a7d6"],
  ["сливовый", "#6b2d5c"],
  ["джинсовый", "#3b5b8a"],
  ["индиго", "#3f3d99"],
  ["васильковый", "#6495ed"],
  ["небесный", "#87ceeb"],
  ["лазурный", "#3b9ae1"],
  ["телесный", "#e3bc9a"],
  ["нюдовый", "#e3bc9a"]
];

/** «тёмно-», «светло-»…: the color mixed with black or white by this much. */
const SHADES: [name: string, toward: string, amount: number][] = [
  ["темный", "#000000", 0.4],
  ["светлый", "#ffffff", 0.45],
  ["бледный", "#ffffff", 0.6],
  ["нежный", "#ffffff", 0.3]
];

/** «синий», «синяя», «сине», «синеватый» → «син». */
const stem = (word: string) => word.replace(/(?:оват|еват)?(?:ый|ий|ой|ая|яя|ое|ее|ые|ие|ого|его|ому|ему|ую|юю|ым|им|ых|их|ыми|ими|о|е)$/, "");
const words = (text: string) => text.toLowerCase().replace(/ё/g, "е").split(/[^а-я]+/).filter(Boolean);

const colorByStem = new Map(NAMED_COLORS.map(([name, hex]) => [stem(name), { name, hex }]));
const shadeByStem = new Map(SHADES.map(([name, toward, amount]) => [stem(name), { toward, amount }]));

/** "#1F3A5F", "1f3a5f", "#13a", "#1f3a5fcc", "rgb(31, 58, 95)" → "#1f3a5f"; a name or anything else → null. */
export function parseColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const digits = raw.match(/^#?([0-9a-f]{3,8})$/)?.[1];
  if (digits?.length === 3 || digits?.length === 4) return `#${digits.slice(0, 3).split("").map((digit) => digit + digit).join("")}`;
  if (digits?.length === 6 || digits?.length === 8) return `#${digits.slice(0, 6)}`;
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/][^)]*)?\)$/);
  const channels = rgb?.slice(1, 4).map(Number);
  return channels?.every((channel) => channel <= 255) ? toHex(channels) : null;
}

/** A code for a color name: «тёмно-синий», «серо-голубой», «молочный»; null when no word is a known color. */
export function colorHexForName(name: string): string | null {
  const colors: number[][] = [];
  let shade: { toward: string; amount: number } | undefined;
  for (const word of words(name)) {
    const key = stem(word);
    shade = shadeByStem.get(key) ?? shade;
    const color = colorByStem.get(key);
    if (color) colors.push(toRgb(color.hex));
  }
  if (!colors.length) return null;
  // «серо-голубой» is a greyish light blue: the last color leads.
  const weights = colors.map((_, index) => (index === colors.length - 1 ? 2 : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let rgb = [0, 1, 2].map((channel) => colors.reduce((sum, color, index) => sum + color[channel] * weights[index], 0) / total);
  if (shade) {
    const { toward, amount } = shade;
    const target = toRgb(toward);
    rgb = rgb.map((channel, index) => channel + (target[index] - channel) * amount);
  }
  return toHex(rgb);
}

/** The AI's code if it is one, else a code by the name (the AI sometimes puts the name into hex). */
export function resolveColorHex(hex: unknown, name: string): string | null {
  return parseColorHex(hex) ?? (typeof hex === "string" ? colorHexForName(hex) : null) ?? colorHexForName(name);
}

/** Colors named in free text, for the draft without AI: «синее платье, есть тёмно-зелёное» → ["синий", "тёмно-зелёное"]. */
export function colorNamesIn(text: string): string[] {
  const names = new Set<string>();
  for (const token of text.match(/[а-яё]+(?:-[а-яё]+)*/gi) ?? []) {
    if (!colorHexForName(token)) continue;
    const lower = token.toLowerCase();
    names.add(lower.includes("-") ? lower : colorByStem.get(stem(lower.replace(/ё/g, "е")))?.name ?? lower);
  }
  return [...names];
}

function toRgb(hex: string) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function toHex(rgb: number[]) {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}
