import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { migrate } from "./migrations.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

interface DatabaseClient {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: unknown[]): Promise<void>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

let connection: Database.Database | null = null;
let client: DatabaseClient | null = null;

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

export function databaseFilename() {
  const configuredValue = process.env.DATABASE_URL?.trim();
  const localValue = "file:./data/database.sqlite";
  const value = configuredValue && configuredValue !== "file:/app/data/database.sqlite" ? configuredValue : localValue;
  const normalized = value.replace(/^file:/, "");
  return path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
}

/**
 * The SQLite connection. WAL: every write appends to a journal instead of
 * rewriting the whole file, readers never wait for writers, and a crash in
 * the middle of a write can't corrupt the database.
 */
export function rawDb() {
  if (!connection) {
    const file = databaseFilename();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    connection = new Database(file);
    connection.pragma("journal_mode = WAL");
    connection.pragma("synchronous = NORMAL");
    connection.pragma("busy_timeout = 5000");
    connection.pragma("foreign_keys = ON");
    // SQLite's LOWER() only lowers ASCII; search needs Cyrillic too.
    connection.function("ulower", { deterministic: true }, (value: unknown) => (value == null ? null : String(value).toLowerCase()));
  }
  return connection;
}

/** better-sqlite3 only binds numbers, strings, bigints, buffers and null. */
function bindable(params: unknown[]) {
  const list = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return list.map((value) => (value === undefined ? null : typeof value === "boolean" ? Number(value) : value));
}

/** Async wrapper kept for the services: they were written for sql.js and await every call. */
export async function getDb(): Promise<DatabaseClient> {
  if (!client) {
    const db = rawDb();
    client = {
      async exec(sql) {
        db.exec(sql);
      },
      async run(sql, ...params) {
        db.prepare(sql).run(...bindable(params));
      },
      async get<T>(sql: string, ...params: unknown[]) {
        return db.prepare(sql).get(...bindable(params)) as T | undefined;
      },
      async all<T>(sql: string, ...params: unknown[]) {
        return db.prepare(sql).all(...bindable(params)) as T[];
      }
    };
  }
  return client;
}

/** Flushes the journal into the main file and closes it (graceful shutdown, tests). */
export function closeDb() {
  if (!connection) return;
  connection.pragma("wal_checkpoint(TRUNCATE)");
  connection.close();
  connection = null;
  client = null;
}

/**
 * The first administrator comes from ADMIN_EMAIL / ADMIN_PASSWORD, and only
 * while there is none. After that the password is the admin's own: changing
 * .env doesn't touch it (reset with `npm run admin:reset-password`).
 */
export async function ensureAdmin(env: NodeJS.ProcessEnv = process.env) {
  const db = await getDb();
  const existing = await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
  if (existing) return "exists";

  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to create the first administrator");
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) throw new Error(`ADMIN_PASSWORD must contain at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`);

  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO users (id, name, email, phone, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, 'ADMIN', ?, ?)",
    crypto.randomUUID(),
    "Admin",
    email,
    await bcrypt.hash(password, 12),
    now,
    now
  );
  console.log(`Created administrator ${email}`);
  return "created";
}

export async function initDatabase() {
  const applied = migrate(rawDb());
  for (const name of applied) console.log(`Applied migration ${name}`);
  await ensureAdmin();
}
