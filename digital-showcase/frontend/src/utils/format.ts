const LETTER_SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];

/** Natural size order for buyers and owners: XS…XXL, then numbers ascending, then everything else as entered. */
export function sortSizes(sizes: string[]) {
  const rank = (size: string) => {
    const letter = LETTER_SIZE_ORDER.indexOf(size.toUpperCase());
    if (letter >= 0) return letter;
    if (/^\d+(\.\d+)?$/.test(size)) return 100 + Number(size);
    return 10000;
  };
  return [...sizes].sort((a, b) => rank(a) - rank(b));
}

/** Russian plural: plural(3, ["раз", "раза", "раз"]) → «раза». Forms: one, few, many. */
export function plural(count: number, [one, few, many]: [string, string, string]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const NEW_PRODUCT_DAYS = 7;

/** Added to the storefront within the last week: gets a «Новинка» badge. */
export function isNewProduct(createdAt: string) {
  const age = Date.now() - Date.parse(createdAt);
  return age >= 0 && age < NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const dayMonthYear = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const monthOnly = new Intl.DateTimeFormat("ru-RU", { month: "long" });
const monthYear = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

/** «12 октября», with the year only when it isn't the current one. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return date.getFullYear() === new Date().getFullYear() ? dayMonth.format(date) : dayMonthYear.format(date);
}

/** «1 500 ₽». */
export function formatMoney(rubles: number) {
  return `${rubles.toLocaleString("ru-RU")} ₽`;
}

/** "2026-09" → «сентябрь» (or «сентябрь 2025 г.» for another year). */
export function formatMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1, 1);
  return year === new Date().getFullYear() ? monthOnly.format(date) : monthYear.format(date);
}

/** «заходил сегодня», «заходил 5 дней назад», «ещё не заходил» — the owner's last visit to the app. */
export function formatLastSeen(value: string | null | undefined) {
  if (!value) return "ещё не заходил";
  const days = Math.floor((Date.now() - Date.parse(value)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "заходил сегодня";
  if (days === 1) return "заходил вчера";
  return `заходил ${days} ${plural(days, ["день", "дня", "дней"])} назад`;
}

const monthShort = new Intl.DateTimeFormat("ru-RU", { month: "short" });

/** "2026-09" → «сент.», «окт. 2025» for another year. */
export function formatMonthShort(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = monthShort.format(new Date(year, monthNumber - 1, 1));
  return year === new Date().getFullYear() ? label : `${label} ${year}`;
}
