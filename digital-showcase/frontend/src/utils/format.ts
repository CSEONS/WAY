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
