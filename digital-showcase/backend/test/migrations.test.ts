import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type BetterSqlite3 from "better-sqlite3";
import { migrate, migrations } from "../src/database/migrations.js";

const Database = createRequire(import.meta.url)("better-sqlite3") as typeof BetterSqlite3;

/** The schema as sql.js-era code created it: no migrations table, old analytics CHECK, fewer columns. */
function legacyDatabase() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT, passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OWNER')), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE stores (id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE, description TEXT, address TEXT, phone TEXT, whatsapp TEXT, telegram TEXT, logoUrl TEXT, coverUrl TEXT,
      isActive INTEGER NOT NULL DEFAULT 1, subscriptionEndsAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE products (id TEXT PRIMARY KEY, storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE, title TEXT NOT NULL,
      description TEXT, price REAL, priceText TEXT, category TEXT,
      status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'NOT_AVAILABLE', 'CHECK_IN_STORE')), isVisible INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE product_images (id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, url TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL);
    CREATE TABLE product_sizes (id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, value TEXT NOT NULL);
    CREATE TABLE product_colors (id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, name TEXT NOT NULL, hex TEXT);
    CREATE TABLE product_variants (id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, colorName TEXT NOT NULL,
      colorHex TEXT, size TEXT NOT NULL, price REAL);
    CREATE TABLE analytics_events (id TEXT PRIMARY KEY, storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      productId TEXT REFERENCES products(id) ON DELETE CASCADE, type TEXT NOT NULL CHECK(type IN ('STORE_VIEW', 'PRODUCT_VIEW')), createdAt TEXT NOT NULL);
  `);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users VALUES ('u1', 'Владелец', NULL, '+79280000001', 'hash', 'OWNER', ?, ?)").run(now, now);
  db.prepare("INSERT INTO stores (id, ownerId, name, slug, coverUrl, createdAt, updatedAt) VALUES ('s1', 'u1', 'Магазин', 'shop', '/old.jpg', ?, ?)").run(now, now);
  db.prepare("INSERT INTO products (id, storeId, title, status, createdAt, updatedAt) VALUES ('p1', 's1', 'Платье', 'AVAILABLE', ?, ?)").run(now, now);
  db.prepare("INSERT INTO analytics_events VALUES ('e1', 's1', 'p1', 'STORE_VIEW', ?)").run(now);
  // Left behind while cascades didn't work under sql.js.
  db.pragma("foreign_keys = OFF");
  db.prepare("INSERT INTO product_sizes VALUES ('z1', 'deleted-product', 'M')").run();
  db.pragma("foreign_keys = ON");
  return db;
}

const columns = (db: BetterSqlite3.Database, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

test("старая база из времён sql.js доводится до текущей схемы без потери данных", () => {
  const db = legacyDatabase();
  const applied = migrate(db);
  assert.equal(applied.length, migrations.length);

  assert.ok(columns(db, "stores").includes("workingHours"));
  assert.ok(columns(db, "stores").includes("aiMonthlyLimit"));
  assert.ok(!columns(db, "stores").includes("coverUrl"));
  assert.ok(columns(db, "users").includes("lastSeenAt"));
  assert.ok(columns(db, "analytics_events").includes("channel"));

  // The new event type is accepted after the table rebuild, old rows are kept.
  db.prepare("INSERT INTO analytics_events (id, storeId, productId, type, channel, createdAt) VALUES ('e2', 's1', NULL, 'CONTACT_CLICK', 'whatsapp', ?)").run(new Date().toISOString());
  assert.equal((db.prepare("SELECT COUNT(*) as count FROM analytics_events").get() as { count: number }).count, 2);
  assert.equal((db.prepare("SELECT title FROM products WHERE id = 'p1'").get() as { title: string }).title, "Платье");
  assert.equal((db.prepare("SELECT COUNT(*) as count FROM product_sizes").get() as { count: number }).count, 0, "orphan removed");
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1, "foreign keys back on");
});

test("повторный запуск ничего не меняет", () => {
  const db = legacyDatabase();
  migrate(db);
  assert.deepEqual(migrate(db), []);
});

test("учёт ИИ принимает превью и хранит прежние записи", () => {
  const db = legacyDatabase();
  migrate(db, migrations.filter((migration) => migration.version < 6));
  const now = new Date().toISOString();
  db.prepare("INSERT INTO ai_usage (id, storeId, kind, units, inputTokens, outputTokens, createdAt) VALUES ('a1', 's1', 'DRAFT', 1, 10, 5, ?)").run(now);
  assert.throws(() => db.prepare("INSERT INTO ai_usage (id, storeId, kind, units, createdAt) VALUES ('a2', 's1', 'PREVIEW', 1, ?)").run(now));

  migrate(db);
  db.prepare("INSERT INTO ai_usage (id, storeId, kind, units, createdAt) VALUES ('a2', 's1', 'PREVIEW', 1, ?)").run(now);
  assert.deepEqual(
    db.prepare("SELECT id, kind, inputTokens FROM ai_usage ORDER BY id").all(),
    [
      { id: "a1", kind: "DRAFT", inputTokens: 10 },
      { id: "a2", kind: "PREVIEW", inputTokens: 0 }
    ]
  );
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'ai_usage_store'").get(), "index rebuilt");
  // Deleting the store still removes its usage.
  db.prepare("DELETE FROM stores WHERE id = 's1'").run();
  assert.equal((db.prepare("SELECT COUNT(*) as count FROM ai_usage").get() as { count: number }).count, 0);
});

test("товар с одной ценой теряет сетку комбинаций, а размеры и цвета остаются; разные цены не трогаются", () => {
  const db = legacyDatabase();
  migrate(db, migrations.filter((migration) => migration.version < 19));
  const now = new Date().toISOString();
  const product = (id: string, price: number | null) =>
    db.prepare("INSERT INTO products (id, storeId, title, price, status, createdAt, updatedAt) VALUES (?, 's1', ?, ?, 'AVAILABLE', ?, ?)").run(id, id, price, now, now);
  const variant = (productId: string, colorName: string, size: string, price: number | null) =>
    db
      .prepare("INSERT INTO product_variants (id, productId, colorName, colorHex, size, price) VALUES (?, ?, ?, '#000000', ?, ?)")
      .run(`${productId}-${colorName}-${size}`, productId, colorName, size, price);
  // One price: a full grid at the product's price; its sizes were saved, its colors weren't (an older save).
  product("one", 3000);
  for (const color of ["Чёрный", "Белый"]) for (const size of ["S", "M"]) variant("one", color, size, 3000);
  db.prepare("INSERT INTO product_sizes VALUES ('one-s', 'one', 'S'), ('one-m', 'one', 'M')").run();
  // Different prices, a partial grid, «Уточнить у продавца»: priced by combination — kept.
  product("different", null);
  variant("different", "Чёрный", "S", 3000);
  variant("different", "Чёрный", "M", 3500);
  product("partial", 3000);
  variant("partial", "Чёрный", "S", 3000);
  variant("partial", "Чёрный", "M", 3000);
  variant("partial", "Белый", "S", 3000);
  product("ask", 3000);
  variant("ask", "Уточнить у продавца", "S", 3000);

  migrate(db);
  const variants = (id: string) => (db.prepare("SELECT COUNT(*) as count FROM product_variants WHERE productId = ?").get(id) as { count: number }).count;
  assert.equal(variants("one"), 0);
  assert.deepEqual(db.prepare("SELECT value FROM product_sizes WHERE productId = 'one' ORDER BY value").all(), [{ value: "M" }, { value: "S" }]);
  assert.deepEqual(db.prepare("SELECT name, hex FROM product_colors WHERE productId = 'one' ORDER BY name").all(), [
    { name: "Белый", hex: "#000000" },
    { name: "Чёрный", hex: "#000000" }
  ]);
  assert.equal(variants("different"), 2);
  assert.equal(variants("partial"), 3);
  assert.equal(variants("ask"), 1);
});

test("новая база создаётся с нуля", () => {
  const db = new Database(":memory:");
  migrate(db);
  for (const table of ["users", "stores", "products", "payments", "ai_usage", "audit_log", "backup_runs", "backup_uploaded_files"]) {
    assert.ok(columns(db, table).length > 0, table);
  }
});

test("ошибка в миграции откатывает её целиком", () => {
  const db = new Database(":memory:");
  migrate(db);
  const broken = [...migrations, { version: 999, name: "broken", up: (target: BetterSqlite3.Database) => target.exec("CREATE TABLE half_done (id TEXT); SELECT * FROM missing_table;") }];
  assert.throws(() => migrate(db, broken));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get(), undefined);
  assert.equal(db.prepare("SELECT version FROM schema_migrations WHERE version = 999").get(), undefined);
});
