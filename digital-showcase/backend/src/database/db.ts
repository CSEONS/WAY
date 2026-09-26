import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

interface DatabaseClient {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: unknown[]): Promise<void>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

let sqlDb: SqlJsDatabase;
let client: DatabaseClient;
let dbFile = "";

function databaseFilename() {
  const configuredValue = process.env.DATABASE_URL?.trim();
  const localValue = "file:./data/database.sqlite";
  const value = configuredValue && configuredValue !== "file:/app/data/database.sqlite" ? configuredValue : localValue;
  const normalized = value.replace(/^file:/, "");
  return normalized.startsWith("/") ? normalized : path.resolve(process.cwd(), normalized);
}

export async function getDb() {
  if (!client) {
    dbFile = databaseFilename();
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const SQL = await initSqlJs();
    sqlDb = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();
    configureConnection();
    client = {
      async exec(sql: string) {
        sqlDb.exec(sql);
        save();
      },
      async run(sql: string, ...params: unknown[]) {
        sqlDb.run(sql, normalizeParams(params));
        save();
      },
      async get<T>(sql: string, ...params: unknown[]) {
        const rows = select<T>(sql, params);
        return rows[0];
      },
      async all<T>(sql: string, ...params: unknown[]) {
        return select<T>(sql, params);
      }
    };
  }
  return client;
}

/**
 * Per-connection settings. sql.js closes and reopens the database on every
 * export() (i.e. every save), which silently resets them — so this runs after
 * each save too. Before this fix foreign keys were effectively off and
 * ON DELETE CASCADE never fired.
 */
function configureConnection() {
  sqlDb.exec("PRAGMA foreign_keys = ON");
  // SQLite's LOWER() only lowers ASCII; search needs Cyrillic too.
  sqlDb.create_function("ulower", (value: unknown) => (value == null ? null : String(value).toLowerCase()));
}

function normalizeParams(params: unknown[]) {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as SqlValue[];
}

function select<T>(sql: string, params: unknown[]) {
  const statement = sqlDb.prepare(sql);
  statement.bind(normalizeParams(params));
  const rows: T[] = [];
  while (statement.step()) rows.push(statement.getAsObject() as T);
  statement.free();
  return rows;
}

function save() {
  fs.writeFileSync(dbFile, Buffer.from(sqlDb.export()));
  configureConnection();
}

/**
 * Rows left behind while cascades did not work (see configureConnection):
 * stores of deleted owners, products of deleted stores and so on. Removed
 * once so foreign keys can be enforced; every removal is logged.
 */
async function removeOrphans(database: DatabaseClient) {
  const checks: [label: string, count: string, fix: string][] = [
    ["stores of deleted owners", "SELECT COUNT(*) as count FROM stores WHERE ownerId NOT IN (SELECT id FROM users)", "DELETE FROM stores WHERE ownerId NOT IN (SELECT id FROM users)"],
    ["products of deleted stores", "SELECT COUNT(*) as count FROM products WHERE storeId NOT IN (SELECT id FROM stores)", "DELETE FROM products WHERE storeId NOT IN (SELECT id FROM stores)"],
    ...["product_images", "product_sizes", "product_colors", "product_variants"].map(
      (table): [string, string, string] => [
        `${table} of deleted products`,
        `SELECT COUNT(*) as count FROM ${table} WHERE productId NOT IN (SELECT id FROM products)`,
        `DELETE FROM ${table} WHERE productId NOT IN (SELECT id FROM products)`
      ]
    ),
    ["analytics of deleted stores", "SELECT COUNT(*) as count FROM analytics_events WHERE storeId NOT IN (SELECT id FROM stores)", "DELETE FROM analytics_events WHERE storeId NOT IN (SELECT id FROM stores)"],
    // Keep the store's view counts; only drop the link to the deleted product.
    [
      "analytics links to deleted products",
      "SELECT COUNT(*) as count FROM analytics_events WHERE productId IS NOT NULL AND productId NOT IN (SELECT id FROM products)",
      "UPDATE analytics_events SET productId = NULL WHERE productId IS NOT NULL AND productId NOT IN (SELECT id FROM products)"
    ]
  ];
  for (const [label, countSql, fixSql] of checks) {
    const row = await database.get<{ count: number }>(countSql);
    if (row?.count) {
      await database.exec(fixSql);
      console.log(`Cleaned up ${row.count} ${label}`);
    }
  }
}

export async function syncAdminUser(database: Pick<DatabaseClient, "get" | "run">, env: NodeJS.ProcessEnv = process.env) {
  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to create the first administrator");
  }
  if (password.length < 6) {
    throw new Error("ADMIN_PASSWORD must contain at least 6 characters");
  }

  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await database.get<{ id: string; name: string; email: string | null }>(
    "SELECT id, name, email FROM users WHERE role = 'ADMIN' ORDER BY createdAt ASC LIMIT 1"
  );

  if (!existing) {
    await database.run(
      "INSERT INTO users (id, name, email, phone, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'ADMIN', ?, ?)",
      crypto.randomUUID(),
      "Admin",
      email,
      null,
      passwordHash,
      now,
      now
    );
    return "created";
  }

  await database.run(
    "UPDATE users SET name = ?, email = ?, passwordHash = ?, updatedAt = ? WHERE id = ?",
    "Admin",
    email,
    passwordHash,
    now,
    existing.id
  );
  return "updated";
}

export async function initDatabase() {
  const database = await getDb();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OWNER')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      address TEXT,
      phone TEXT,
      whatsapp TEXT,
      telegram TEXT,
      logoUrl TEXT,
      workingHours TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      aiFormEnabled INTEGER NOT NULL DEFAULT 0,
      subscriptionEndsAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      price REAL,
      priceText TEXT,
      category TEXT,
      status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'NOT_AVAILABLE', 'CHECK_IN_STORE')),
      isVisible INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_sizes (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_colors (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      hex TEXT
    );
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      colorName TEXT NOT NULL,
      colorHex TEXT,
      size TEXT NOT NULL,
      price REAL
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      productId TEXT REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('STORE_VIEW', 'PRODUCT_VIEW', 'CONTACT_CLICK')),
      channel TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      storeName TEXT,
      city TEXT,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW', 'DONE')),
      createdAt TEXT NOT NULL
    );
  `);

  const storeColumns = await database.all<{ name: string }>("PRAGMA table_info(stores)");
  if (!storeColumns.some((column) => column.name === "aiFormEnabled")) {
    await database.exec("ALTER TABLE stores ADD COLUMN aiFormEnabled INTEGER NOT NULL DEFAULT 0");
  }
  if (storeColumns.some((column) => column.name === "coverUrl")) {
    await database.exec("ALTER TABLE stores DROP COLUMN coverUrl");
  }
  if (!storeColumns.some((column) => column.name === "workingHours")) {
    await database.exec("ALTER TABLE stores ADD COLUMN workingHours TEXT");
  }

  await removeOrphans(database);

  // SQLite can't alter a CHECK constraint: rebuild analytics_events to allow
  // CONTACT_CLICK (a buyer tapped WhatsApp/Telegram/call) and add `channel`.
  // Foreign keys are off only for this one exec (the documented rebuild recipe).
  const analyticsTable = await database.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'");
  if (analyticsTable && !analyticsTable.sql.includes("CONTACT_CLICK")) {
    await database.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      CREATE TABLE analytics_events_new (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        productId TEXT REFERENCES products(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('STORE_VIEW', 'PRODUCT_VIEW', 'CONTACT_CLICK')),
        channel TEXT,
        createdAt TEXT NOT NULL
      );
      INSERT INTO analytics_events_new (id, storeId, productId, type, createdAt)
        SELECT id, storeId, productId, type, createdAt FROM analytics_events;
      DROP TABLE analytics_events;
      ALTER TABLE analytics_events_new RENAME TO analytics_events;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  const existing = await database.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
  if (!existing?.count) {
    await syncAdminUser(database, process.env);
  } else {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (email && password) {
      await syncAdminUser(database, process.env);
    }
  }
}
