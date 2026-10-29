import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-moderation-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

// The AI model: answers who is on the picture with whatever the test puts here.
let answer = '{"found": []}';
const ai = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ output_text: answer, usage: { input_tokens: 300, output_tokens: 40 } }));
  });
});
ai.listen(0);
process.env.AI_API_KEY = "test-key";
process.env.AI_BASE_URL = `http://127.0.0.1:${(ai.address() as AddressInfo).port}/v1`;

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { createStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const productService = await import("../src/services/productService.js");
const moderation = await import("../src/services/imageModerationService.js");

await initDatabase();
const db = await getDb();
const admin = (await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN'"))!;
const owner = (await createOwner({ name: "Владелец", phone: "+79280000003", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "Платья", slug: "moderation-shop" }))!;

async function photo(width = 200, height = 200) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).png().toBuffer();
  return { buffer, mimetype: "image/png", originalname: "photo.png", size: buffer.length };
}

test("ответ ИИ: короткие строки, мусор отбрасывается", () => {
  assert.deepEqual(moderation.parseLivingBeings('Вот: {"found": ["лицо человека", "", 5]}'), { found: ["лицо человека", "5"] });
  assert.deepEqual(moderation.parseLivingBeings('{"found": []}'), { found: [] });
  assert.deepEqual(moderation.cleanFindings(["x".repeat(200), ...Array(20).fill("кот")]).length, 10);
  assert.equal(moderation.cleanFindings("не список").length, 0);
  assert.throws(() => moderation.parseLivingBeings("никого нет"), /не JSON/);
});

test("фото с живыми существами видно покупателям, пока модератор не решит; «Скрыть» его прячет", async () => {
  const product = (await productService.createProduct({ storeId: store.id, title: "Платье", isVisible: 1 }))!;
  const added = (await productService.addProductImage(product.id, store.id, await photo()))!;

  answer = '{"found": ["лицо человека"]}';
  const result = await moderation.checkImage({ url: added.url, kind: "PRODUCT", storeId: store.id, productId: product.id }, (await photo()).buffer);
  assert.deepEqual(result?.found, ["лицо человека"]);

  // Buyers: still the photo (the owner is warned, the admin decides); owner: «на проверке»; admin panel: one to look at.
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 1);
  assert.equal((await productService.listProducts(store.id, true))[0].images.length, 1);
  const ownerImage = (await productService.getProduct(product.id, store.id))!.images[0];
  assert.deepEqual(ownerImage.moderation, { status: "PENDING", findings: "лицо человека" });
  assert.equal(await moderation.countPending(), 1);
  const [check] = await moderation.listChecks("PENDING");
  assert.equal(check.productTitle, "Платье");
  assert.equal(check.storeName, "Платья");

  await moderation.review(check.id, "APPROVED", admin.id);
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 1);
  assert.equal(await moderation.countPending(), 0);

  await moderation.review(check.id, "REJECTED", admin.id);
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 0);

  // A deleted photo leaves nothing to moderate.
  await productService.deleteProductImage(product.id, store.id, ownerImage.id);
  assert.equal((await moderation.listChecks("REJECTED")).length, 0);
});

test("без живых существ фото не помечается; логотип с ними виден, пока модератор не скроет", async () => {
  answer = '{"found": []}';
  assert.equal(await moderation.checkImage({ url: "/uploads/clean.webp", kind: "LOGO", storeId: store.id }, (await photo()).buffer), null);
  assert.equal(await moderation.publicLogo("/uploads/clean.webp"), "/uploads/clean.webp");

  answer = '{"found": ["кот на логотипе"]}';
  await moderation.checkImage({ url: "/uploads/cat-logo.webp", kind: "LOGO", storeId: store.id }, (await photo()).buffer);
  assert.equal(await moderation.publicLogo("/uploads/cat-logo.webp"), "/uploads/cat-logo.webp");
});

test("превью с людьми: товар уходит на проверку сразу при сохранении, без повторного запроса к ИИ", async () => {
  const product = (await productService.createProduct({ storeId: store.id, title: "Куртка", isVisible: 1 }))!;
  const added = (await productService.addProductImage(product.id, store.id, await photo()))!;
  // The AI would say «nobody» — but the preview's findings already decide.
  answer = '{"found": []}';
  await moderation.flagImage({ url: added.url, kind: "PRODUCT", storeId: store.id, productId: product.id }, ["человек в куртке"]);
  const image = (await productService.getProduct(product.id, store.id))!.images[0];
  assert.deepEqual(image.moderation, { status: "PENDING", findings: "человек в куртке" });
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 1, "visible until the moderator decides");
});

test("«Показывать все» / «Скрыть все»: решение для каждого фото, которое ещё ждёт; уже решённые не трогаются", async () => {
  const product = (await productService.createProduct({ storeId: store.id, title: "Шапка", isVisible: 1 }))!;
  const urls = [];
  for (let index = 0; index < 3; index += 1) {
    const added = (await productService.addProductImage(product.id, store.id, await photo()))!;
    await moderation.flagImage({ url: added.url, kind: "PRODUCT", storeId: store.id, productId: product.id }, ["лицо человека"]);
    urls.push(added.url);
  }
  const waiting = (await moderation.listChecks("PENDING")).filter((check) => urls.includes(check.url));
  assert.equal(waiting.length, 3);
  // One was decided in another tab: hidden, and «Показывать все» doesn't bring it back.
  await moderation.review(waiting[0].id, "REJECTED", admin.id);

  const reviewed = await moderation.reviewMany([...waiting.map((check) => check.id), waiting[1].id, "missing"], "APPROVED", admin.id);
  assert.equal(reviewed.length, 2);
  const statuses = await db.all<{ status: string }>(`SELECT status FROM image_checks WHERE url IN (${urls.map(() => "?").join(", ")}) ORDER BY status`, ...urls);
  assert.deepEqual(statuses.map((row) => row.status), ["APPROVED", "APPROVED", "REJECTED"]);
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 2);
});

test.after(() => {
  ai.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
