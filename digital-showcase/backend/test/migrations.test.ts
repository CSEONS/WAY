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
