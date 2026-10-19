import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-notifications-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { createStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { createProduct, getProduct, listProducts } = await import("../src/services/productService.js");
const notifications = await import("../src/services/notificationService.js");
const moderation = await import("../src/services/imageModerationService.js");

await initDatabase();
const db = await getDb();
const admin = (await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN'"))!;
const owner = (await createOwner({ name: "Владелец", phone: "+79280000011", password: "secret123" }))!;
const other = (await createOwner({ name: "Другой", phone: "+79280000012", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "Мой магазин", slug: "my-shop" }))!;
await createStore({ ownerId: other.id, name: "Другой магазин", slug: "other-shop" });

async function productWithPhoto(title: string, url: string) {
  const product = (await createProduct({ storeId: store.id, title, status: "AVAILABLE", isVisible: 1 }))!;
  await db.run("INSERT INTO product_images (id, productId, url, sortOrder, createdAt) VALUES (?, ?, ?, 0, ?)", crypto.randomUUID(), product.id, url, new Date().toISOString());
  return product;
}

const publicTitles = async () => (await listProducts(store.id, true)).map((product) => product.title);

test("уведомления: непрочитанное на ту же тему заменяется, чтение — своё", async () => {
  await notifications.notifyUser({ userId: owner.id, source: "SYSTEM", title: "Первое", body: "a", topic: "t1" });
  await notifications.notifyUser({ userId: owner.id, source: "SYSTEM", title: "Второе", body: "b", topic: "t1" });
  let mine = await notifications.listForUser(owner.id);
  assert.equal(mine.unread, 1);
  assert.equal(mine.items[0].title, "Второе");

  await notifications.markRead(owner.id);
  await notifications.notifyUser({ userId: owner.id, source: "SYSTEM", title: "Третье", body: "c", topic: "t1" });
  mine = await notifications.listForUser(owner.id);
  assert.equal(mine.items.length, 2, "a read one stays, a new one is added");
  assert.equal(mine.unread, 1);
  assert.equal((await notifications.listForUser(other.id)).items.length, 0);
});

test("рассылка админа: всем владельцам или одному магазину, история с прочтениями", async () => {
  const all = await notifications.sendFromAdmin({ storeId: null, title: "Обновление", body: "Новые функции" });
  assert.equal(all.sent, 2);
  const one = await notifications.sendFromAdmin({ storeId: store.id, title: "Лично вам", body: "Привет" });
  assert.equal(one.sent, 1);
  const mine = await notifications.listForUser(owner.id);
  assert.ok(mine.items.some((item) => item.title === "Лично вам" && item.source === "ADMIN" && item.storeId === store.id));
  assert.equal((await notifications.listForUser(other.id)).items.length, 1);

  await notifications.markRead(other.id);
  const history = await notifications.adminHistory();
  const broadcast = history.find((row) => row.batchId === all.batchId)!;
  assert.deepEqual({ recipients: broadcast.recipients, read: broadcast.read }, { recipients: 2, read: 1 });
  assert.equal(history.find((row) => row.batchId === one.batchId)!.storeName, "Мой магазин");
});

test("фото с лицом: остаётся на витрине, владелец получает уведомление с товаром и правилом", async () => {
  await notifications.markRead(owner.id);
  const product = await productWithPhoto("Футболка с котом", "/uploads/cat.webp");
  await moderation.flagImage({ url: "/uploads/cat.webp", kind: "PRODUCT", storeId: store.id, productId: product.id }, ["морда кота на принте"]);

  const forBuyers = await getProduct(product.id, store.id, true);
  assert.equal(forBuyers?.images.length, 1, "the photo is not hidden while waiting");
  const notice = (await notifications.listForUser(owner.id)).items[0];
  assert.equal(notice.title, "Подозрение на нарушение правил площадки");
  assert.match(notice.body, /Товар «Футболка с котом»: на фото морда кота на принте/);
  assert.match(notice.body, /нельзя показывать лица людей и морды животных/);
  assert.equal(notice.link, `/dashboard/stores/${store.id}/products/${product.id}/edit`);
});

test("решения модератора: скрыть фото, снять товар, вернуть", async () => {
  const product = await productWithPhoto("Платье", "/uploads/face.webp");
  await moderation.flagImage({ url: "/uploads/face.webp", kind: "PRODUCT", storeId: store.id, productId: product.id }, ["лицо человека"]);
  const check = (await moderation.listChecks("PENDING")).find((item) => item.productId === product.id)!;

  await moderation.review(check.id, "REJECTED", admin.id);
  assert.equal((await getProduct(product.id, store.id, true))?.images.length, 0, "the photo is hidden");
  assert.ok((await publicTitles()).includes("Платье"), "the product stays");
  assert.equal((await notifications.listForUser(owner.id)).items[0].title, "Фото скрыто администратором");

  await moderation.review(check.id, "PRODUCT_BLOCKED", admin.id);
  assert.ok(!(await publicTitles()).includes("Платье"), "the product is off the storefront");
  assert.equal(await getProduct(product.id, store.id, true), null);
  const blocked = await getProduct(product.id, store.id);
  assert.ok(blocked?.blockedAt);
  assert.match(blocked?.blockedReason ?? "", /лицо человека/);
  assert.equal((await notifications.listForUser(owner.id)).items[0].title, "Товар снят с витрины");
  assert.ok((await moderation.listBlockedProducts()).some((item) => item.id === product.id));

  // The owner deleted the photo: the product comes back from «Снятые товары».
  await moderation.forgetImage("/uploads/face.webp");
  await moderation.unblockProduct(product.id);
  assert.ok((await publicTitles()).includes("Платье"));
  assert.equal((await notifications.listForUser(owner.id)).items[0].title, "Товар снова на витрине");
  await assert.rejects(moderation.unblockProduct(product.id), (error: { status?: number }) => error.status === 404);
});

test("одобрение возвращает товар, снятый из-за этого фото", async () => {
  const product = await productWithPhoto("Куртка", "/uploads/jacket.webp");
  await moderation.flagImage({ url: "/uploads/jacket.webp", kind: "PRODUCT", storeId: store.id, productId: product.id }, ["лицо человека"]);
  const check = (await moderation.listChecks("PENDING")).find((item) => item.productId === product.id)!;
  await moderation.review(check.id, "PRODUCT_BLOCKED", admin.id);
  assert.ok(!(await publicTitles()).includes("Куртка"));
  await moderation.review(check.id, "APPROVED", admin.id);
  assert.ok((await publicTitles()).includes("Куртка"));
  const notice = (await notifications.listForUser(owner.id)).items[0];
  assert.equal(notice.title, "Проверка пройдена");
  assert.match(notice.body, /Товар снова на витрине/);
});

test("логотип с лицом не прячется до решения, а снять с витрины можно только товар", async () => {
  await db.run("UPDATE stores SET logoUrl = '/uploads/logo.webp' WHERE id = ?", store.id);
  await moderation.flagImage({ url: "/uploads/logo.webp", kind: "LOGO", storeId: store.id }, ["лицо человека"]);
  assert.equal(await moderation.publicLogo("/uploads/logo.webp"), "/uploads/logo.webp");
  const check = (await moderation.listChecks("PENDING")).find((item) => item.kind === "LOGO")!;
  await assert.rejects(moderation.review(check.id, "PRODUCT_BLOCKED", admin.id), (error: { status?: number }) => error.status === 400);
  await moderation.review(check.id, "REJECTED", admin.id);
  assert.equal(await moderation.publicLogo("/uploads/logo.webp"), null);
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
