import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-db-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";

const { getDb, initDatabase } = await import("../src/database/db.js");
const { createOwner } = await import("../src/services/userService.js");
const { createStore } = await import("../src/services/storeService.js");
const { createProduct, deleteProduct, listProducts } = await import("../src/services/productService.js");

await initDatabase();
const owner = await createOwner({ name: "Владелец", password: "secret123" });
const store = await createStore({ ownerId: owner!.id, name: "Магазин", slug: "shop" });

test("каскадное удаление работает и после сохранений базы", async () => {
  const product = await createProduct({ storeId: store!.id, title: "Платье", sizes: ["S", "M"], colors: [{ name: "Синий" }] });
  const db = await getDb();
  const countSizes = async () => (await db.get<{ count: number }>("SELECT COUNT(*) as count FROM product_sizes WHERE productId = ?", product!.id))!.count;
  assert.equal(await countSizes(), 2);

  await deleteProduct(product!.id, store!.id);

  // Before the fix every save reset PRAGMA foreign_keys, so sizes stayed behind.
  assert.equal(await countSizes(), 0);
});

test("поиск находит русские названия без учёта регистра", async () => {
  await createProduct({ storeId: store!.id, title: "Льняное Платье" });
  const found = await listProducts(store!.id, true, { q: "платье" });
  assert.deepEqual(found.map((item) => item.title), ["Льняное Платье"]);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
