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
let answer = '{"found": [], "faces": []}';
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

async function pixel(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return data[offset];
}

test("ответ ИИ: доли зажимаются в 0–1, мусор отбрасывается, лицо без слов — всё равно находка", () => {
  const parsed = moderation.parseLivingBeings('Вот: {"found": ["лицо человека"], "faces": [{"x": -0.2, "y": 0.5, "width": 0.4, "height": 2}, {"x": "a"}]}');
  assert.deepEqual(parsed, { found: ["лицо человека"], faces: [{ x: 0, y: 0.5, width: 0.4, height: 0.5 }] });
  assert.deepEqual(moderation.parseLivingBeings('{"faces": [{"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}]}').found, ["лицо"]);
  assert.deepEqual(moderation.parseLivingBeings('{"found": [], "faces": []}'), { found: [], faces: [] });
  assert.throws(() => moderation.parseLivingBeings("никого нет"), /не JSON/);
});

test("маркер закрывает лицо целиком и не трогает остальное", async () => {
  const { buffer } = await photo();
  const covered = await moderation.coverWithMarker(buffer, [{ x: 0.3, y: 0.3, width: 0.4, height: 0.4 }]);
  for (const [x, y] of [
    [100, 100],
    [62, 62],
    [138, 138],
    [62, 138]
  ]) {
    assert.ok((await pixel(covered, x, y)) < 60, `точка ${x},${y} закрашена`);
  }
  assert.ok((await pixel(covered, 5, 5)) > 240, "угол остался белым");
});

test("фото с живыми существами скрыто от покупателей, пока модератор не решит", async () => {
  const product = (await productService.createProduct({ storeId: store.id, title: "Платье", isVisible: 1 }))!;
  const added = (await productService.addProductImage(product.id, store.id, await photo()))!;

  answer = '{"found": ["лицо человека"], "faces": [{"x": 0.3, "y": 0.1, "width": 0.3, "height": 0.3}]}';
  const result = await moderation.checkImage({ url: added.url, kind: "PRODUCT", storeId: store.id, productId: product.id }, (await photo()).buffer);
  assert.deepEqual(result?.found, ["лицо человека"]);

  // Buyers: no photo; owner: the photo with «на проверке»; admin panel: one to look at.
  assert.equal((await productService.getProduct(product.id, store.id, true))!.images.length, 0);
  assert.equal((await productService.listProducts(store.id, true))[0].images.length, 0);
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

test("без живых существ фото не помечается; логотип с ними скрыт от покупателей", async () => {
  answer = '{"found": [], "faces": []}';
  assert.equal(await moderation.checkImage({ url: "/uploads/clean.webp", kind: "LOGO", storeId: store.id }, (await photo()).buffer), null);
  assert.equal(await moderation.publicLogo("/uploads/clean.webp"), "/uploads/clean.webp");

  answer = '{"found": ["кот на логотипе"], "faces": [{"x": 0.4, "y": 0.4, "width": 0.2, "height": 0.2}]}';
  await moderation.checkImage({ url: "/uploads/cat-logo.webp", kind: "LOGO", storeId: store.id }, (await photo()).buffer);
  assert.equal(await moderation.publicLogo("/uploads/cat-logo.webp"), null);
});

test.after(() => {
  ai.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
