import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";

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
  const value = process.env.DATABASE_URL ?? "file:./data/database.sqlite";
  return value.replace(/^file:/, "");
}

export async function getDb() {
  if (!client) {
    dbFile = databaseFilename();
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const SQL = await initSqlJs();
    sqlDb = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();
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
    await client.exec("PRAGMA foreign_keys = ON");
  }
  return client;
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
      coverUrl TEXT,
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
      type TEXT NOT NULL CHECK(type IN ('STORE_VIEW', 'PRODUCT_VIEW')),
      createdAt TEXT NOT NULL
    );
  `);

  const storeColumns = await database.all<{ name: string }>("PRAGMA table_info(stores)");
  if (!storeColumns.some((column) => column.name === "aiFormEnabled")) {
    await database.exec("ALTER TABLE stores ADD COLUMN aiFormEnabled INTEGER NOT NULL DEFAULT 0");
  }

  const existing = await database.get<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'");
  if (!existing?.count) {
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash("admin123", 10);
    await database.run(
      "INSERT INTO users (id, name, email, phone, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'ADMIN', ?, ?)",
      crypto.randomUUID(),
      "Admin",
      "admin@example.com",
      null,
      passwordHash,
      now,
      now
    );
  }
}
