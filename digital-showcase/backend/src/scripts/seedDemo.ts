// Creates the demo storefront the landing page links to («Посмотреть пример»):
// store /m/demo with ten products, drawn illustrations instead of photos.
// Its WhatsApp and phone are SUPPORT_WHATSAPP / SUPPORT_PHONE, so a visitor
// who taps «Написать» in the example reaches you. Runs once; if the store
// exists, nothing changes. Edit it afterwards via «Войти как владелец».
//   Docker:  docker compose exec -u node backend npm run demo:seed
//   Locally: npx tsx src/scripts/seedDemo.ts
import crypto from "node:crypto";
import sharp from "sharp";
import { closeDb, getDb, initDatabase } from "../database/db.js";
import { addProductImage, createProduct } from "../services/productService.js";
import { createStore, getStoreBySlug, updateStore } from "../services/storeService.js";
import { createOwner } from "../services/userService.js";
import type { ProductStatus } from "../types/models.js";

const SLUG = process.env.DEMO_STORE_SLUG || "demo";
const DAY_MS = 24 * 60 * 60 * 1000;

// Garment outlines on an 800×1000 canvas.
const SHAPES: Record<string, string> = {
  dress: "M330 210 Q400 255 470 210 L495 330 Q470 380 482 420 L610 800 Q400 845 190 800 L318 420 Q330 380 305 330 Z",
  tshirt: "M255 250 L335 205 Q400 250 465 205 L545 250 L645 345 L585 410 L540 375 L540 790 L260 790 L260 375 L215 410 L155 345 Z",
  shirt: "M270 235 L350 200 L400 250 L450 200 L530 235 L615 470 L565 490 L530 380 L530 800 L270 800 L270 380 L235 490 L185 470 Z",
  trousers: "M275 215 L525 215 L548 800 L432 800 L400 420 L368 800 L252 800 Z",
  skirt: "M300 280 L500 280 L610 745 Q400 790 190 745 Z",
  coat: "M290 190 L362 170 L400 265 L438 170 L510 190 L605 300 L628 820 L172 820 L195 300 Z",
  jacket: "M290 220 L362 200 L400 290 L438 200 L510 220 L600 320 L618 700 L182 700 L200 320 Z",
  bag: "M250 430 H550 Q580 430 580 460 V740 Q580 770 550 770 H250 Q220 770 220 740 V460 Q220 430 250 430 Z"
};
const DETAILS: Record<string, string> = {
  bag: '<path d="M315 430 Q315 285 400 285 Q485 285 485 430" fill="none" stroke="FG" stroke-width="26" stroke-linecap="round"/>',
  coat: '<line x1="400" y1="265" x2="400" y2="820" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6"/><rect x="195" y="520" width="410" height="26" fill="#ffffff" fill-opacity="0.25"/>',
  jacket: '<line x1="400" y1="290" x2="400" y2="700" stroke="#ffffff" stroke-opacity="0.35" stroke-width="6"/>',
  shirt: '<line x1="400" y1="250" x2="400" y2="800" stroke="#ffffff" stroke-opacity="0.35" stroke-width="5"/>',
  skirt: '<rect x="300" y="262" width="200" height="30" rx="6" fill="FG"/>',
  trousers: '<rect x="275" y="200" width="250" height="28" rx="6" fill="FG"/>'
};

async function illustration(shape: string, color: string, background: string) {
  const details = (DETAILS[shape] ?? "").replaceAll("FG", color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
    <rect width="800" height="1000" fill="${background}"/>
    <ellipse cx="400" cy="860" rx="250" ry="26" fill="#000000" fill-opacity="0.07"/>
    <path d="${SHAPES[shape]}" fill="${color}"/>
    ${details}
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, mimetype: "image/png", originalname: `${shape}.png`, size: buffer.length };
}

interface DemoColor {
  name: string;
  hex: string;
  background: string;
  /** Price of this color when it differs. */
  price?: number;
}

interface DemoProduct {
  title: string;
  description: string;
  category: string;
  shape: string;
  price: number | null;
  priceText?: string;
  status?: ProductStatus;
  sizes: string[];
  colors: DemoColor[];
  /** Added this many days ago: under 7 shows «Новинка». */
  ageDays: number;
}

const products: DemoProduct[] = [
  {
    title: "Платье миди из льна",
    description: "Свободный крой, пояс в комплекте. Лён 100%, не просвечивает.",
    category: "Платья",
    shape: "dress",
    price: 4900,
    sizes: ["S", "M", "L"],
    colors: [
      { name: "Синий", hex: "#3B5BDB", background: "#E3E9FB" },
      { name: "Бежевый", hex: "#C9A77C", background: "#F4EDE3", price: 5200 }
    ],
    ageDays: 2
  },
  {
    title: "Платье-рубашка",
    description: "На пуговицах, с карманами. Хлопок.",
    category: "Платья",
    shape: "dress",
    price: 3900,
    sizes: ["XS", "S", "M"],
    colors: [{ name: "Зелёный", hex: "#2F9E6B", background: "#E2F4EA" }],
    ageDays: 5
  },
  {
    title: "Футболка оверсайз",
    description: "Плотный хлопок, не садится после стирки.",
    category: "Верх",
    shape: "tshirt",
    price: 1490,
    sizes: ["S", "M", "L", "XL"],
    colors: [
      { name: "Чёрный", hex: "#1F1F24", background: "#E9E9EC" },
      { name: "Белый", hex: "#FAFAFA", background: "#DADDE3" }
    ],
    ageDays: 12
  },
  {
    title: "Блузка с объёмными рукавами",
    description: "Вискоза, мягкая и струящаяся.",
    category: "Верх",
    shape: "shirt",
    price: 2700,
    sizes: ["S", "M", "L"],
    colors: [{ name: "Розовый", hex: "#E0668F", background: "#FBE6EE" }],
    ageDays: 20
  },
  {
    title: "Рубашка классическая",
    description: "Под пиджак и на каждый день.",
    category: "Верх",
    shape: "shirt",
    price: 2300,
    status: "NOT_AVAILABLE",
    sizes: ["M", "L"],
    colors: [{ name: "Голубой", hex: "#6FA8DC", background: "#E6F0FA" }],
    ageDays: 35
  },
  {
    title: "Джинсы прямые",
    description: "Высокая посадка, плотный деним.",
    category: "Низ",
    shape: "trousers",
    price: 3200,
    sizes: ["42", "44", "46", "48"],
    colors: [{ name: "Синий", hex: "#2B4C8C", background: "#E3E8F3" }],
    ageDays: 16
  },
  {
    title: "Юбка плиссе",
    description: "Длина миди, на резинке.",
    category: "Низ",
    shape: "skirt",
    price: 2800,
    sizes: ["S", "M"],
    colors: [
      { name: "Бордовый", hex: "#8C2F4B", background: "#F5E4EA" },
      { name: "Чёрный", hex: "#1F1F24", background: "#E9E9EC" }
    ],
    ageDays: 3
  },
  {
    title: "Тренч классический",
    description: "Водоотталкивающая ткань, пояс, подкладка.",
    category: "Верхняя одежда",
    shape: "coat",
    price: null,
    priceText: "Уточнить у продавца",
    status: "CHECK_IN_STORE",
    sizes: ["S", "M", "L"],
    colors: [{ name: "Бежевый", hex: "#B8956A", background: "#F3ECE2" }],
    ageDays: 40
  },
  {
    title: "Пиджак оверсайз",
    description: "Без подкладки, с подплечниками.",
    category: "Верхняя одежда",
    shape: "jacket",
    price: 6400,
    sizes: ["S", "M", "L"],
    colors: [{ name: "Серый", hex: "#6B7280", background: "#EDEEF1" }],
    ageDays: 25
  },
  {
    title: "Сумка-шопер",
    description: "Экокожа, внутренний карман на молнии.",
    category: "Аксессуары",
    shape: "bag",
    price: 2100,
    sizes: [],
    colors: [
      { name: "Коричневый", hex: "#7C4A2D", background: "#F2E9E2" },
      { name: "Чёрный", hex: "#1F1F24", background: "#E9E9EC" }
    ],
    ageDays: 30
  }
];

await initDatabase();
if (await getStoreBySlug(SLUG)) {
  console.log(`Store /m/${SLUG} already exists — nothing to do.`);
  closeDb();
  process.exit(0);
}

const db = await getDb();
const email = `demo-${crypto.randomBytes(4).toString("hex")}@showcase.local`;
// Nobody signs in with this password: the admin opens the store via «Войти как владелец».
const owner = await createOwner({ name: "Демо-магазин", email, password: crypto.randomBytes(24).toString("hex") });
const contact = process.env.SUPPORT_WHATSAPP?.trim() || process.env.SUPPORT_PHONE?.trim() || null;
const store = await createStore({
  ownerId: owner!.id,
  name: "Пример витрины",
  slug: SLUG,
  description: "Так покупатели видят ваш магазин: каталог с фото, ценами, размерами и наличием. Товары здесь для примера.",
  address: "ул. Примерная, 1",
  workingHours: "Ежедневно 10:00–20:00",
  whatsapp: process.env.SUPPORT_WHATSAPP?.trim() || contact,
  phone: process.env.SUPPORT_PHONE?.trim() || contact,
  telegram: process.env.SUPPORT_TELEGRAM?.trim() || null
});
// The example never expires.
await updateStore(store!.id, { subscriptionEndsAt: null });

for (const [index, item] of products.entries()) {
  const hasVariants = item.sizes.length > 0;
  const product = await createProduct({
    storeId: store!.id,
    title: item.title,
    description: item.description,
    category: item.category,
    status: item.status ?? "AVAILABLE",
    price: item.colors.some((color) => color.price) ? null : item.price,
    priceText: item.priceText ?? null,
    isVisible: 1,
    sizes: item.sizes,
    colors: item.colors.map((color) => ({ name: color.name, hex: color.hex })),
    variants: hasVariants
      ? item.colors.flatMap((color) => item.sizes.map((size) => ({ colorName: color.name, colorHex: color.hex, size, price: color.price ?? item.price })))
      : undefined
  });
  for (const color of item.colors) {
    await addProductImage(product!.id, store!.id, await illustration(item.shape, color.hex, color.background));
  }
  // Spread the dates so only the fresh ones get «Новинка» and «Сначала новые» looks natural.
  const createdAt = new Date(Date.now() - item.ageDays * DAY_MS - index * 60_000).toISOString();
  await db.run("UPDATE products SET createdAt = ?, updatedAt = ? WHERE id = ?", createdAt, createdAt, product!.id);
}

console.log(`Demo store is ready: /m/${SLUG} (${products.length} products).${contact ? "" : " Set SUPPORT_WHATSAPP to show contact buttons in it."}`);
closeDb();
