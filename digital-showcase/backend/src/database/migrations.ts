import type { Database } from "better-sqlite3";

/**
 * Schema changes, applied once each and recorded in schema_migrations.
 * Never edit a released migration: add a new one with the next version.
 */
export interface Migration {
  version: number;
  name: string;
  /** Table rebuilds need foreign keys off (the documented SQLite recipe). */
  withoutForeignKeys?: boolean;
  up: (db: Database) => void;
}

function columns(db: Database, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name);
}

function addColumn(db: Database, table: string, column: string, definition: string) {
  if (!columns(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Rows left behind while ON DELETE CASCADE silently didn't work under sql.js:
 * stores of deleted owners, products of deleted stores and so on.
 */
function removeOrphans(db: Database) {
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
    const { count } = db.prepare(countSql).get() as { count: number };
    if (count) {
      db.exec(fixSql);
      console.log(`Cleaned up ${count} ${label}`);
    }
  }
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          phone TEXT,
          passwordHash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OWNER')),
          lastSeenAt TEXT,
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
          aiMonthlyLimit INTEGER,
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
        -- No foreign key: revenue history stays when a store is deleted.
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          storeName TEXT NOT NULL,
          amount INTEGER NOT NULL,
          months INTEGER NOT NULL,
          method TEXT NOT NULL CHECK(method IN ('CASH', 'TRANSFER', 'OTHER')),
          comment TEXT,
          periodStart TEXT,
          periodEnd TEXT NOT NULL,
          createdBy TEXT,
          createdAt TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ai_usage (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('DRAFT', 'BULK')),
          units INTEGER NOT NULL,
          inputTokens INTEGER NOT NULL DEFAULT 0,
          outputTokens INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL
        );
        -- Who did what in the admin panel. Names are copied so entries stay readable after deletions.
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          actorId TEXT,
          actorName TEXT NOT NULL,
          action TEXT NOT NULL,
          targetType TEXT,
          targetId TEXT,
          targetName TEXT,
          details TEXT,
          createdAt TEXT NOT NULL
        );
      `);
    }
  },
  {
    // Databases from before this table existed were changed by ad-hoc code at
    // startup; bring any of them to the schema above. Safe on a new database.
    version: 2,
    name: "bring older databases up to date",
    withoutForeignKeys: true,
    up(db) {
      addColumn(db, "stores", "aiFormEnabled", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "stores", "workingHours", "TEXT");
      addColumn(db, "stores", "aiMonthlyLimit", "INTEGER");
      addColumn(db, "users", "lastSeenAt", "TEXT");
      if (columns(db, "stores").includes("coverUrl")) db.exec("ALTER TABLE stores DROP COLUMN coverUrl");

      removeOrphans(db);

      // SQLite can't alter a CHECK constraint: rebuild analytics_events to allow CONTACT_CLICK and add `channel`.
      const analytics = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'").get() as { sql: string } | undefined;
      if (analytics && !analytics.sql.includes("CONTACT_CLICK")) {
        db.exec(`
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
        `);
      }
    }
  },
  {
    version: 3,
    name: "indexes for storefront, stats and admin lists",
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS stores_owner ON stores(ownerId);
        CREATE INDEX IF NOT EXISTS products_store ON products(storeId, createdAt);
        CREATE INDEX IF NOT EXISTS product_images_product ON product_images(productId, sortOrder);
        CREATE INDEX IF NOT EXISTS product_sizes_product ON product_sizes(productId);
        CREATE INDEX IF NOT EXISTS product_colors_product ON product_colors(productId);
        CREATE INDEX IF NOT EXISTS product_variants_product ON product_variants(productId);
        CREATE INDEX IF NOT EXISTS analytics_store ON analytics_events(storeId, type, createdAt);
        CREATE INDEX IF NOT EXISTS analytics_product ON analytics_events(productId);
        CREATE INDEX IF NOT EXISTS payments_store ON payments(storeId, createdAt);
        CREATE INDEX IF NOT EXISTS ai_usage_store ON ai_usage(storeId, createdAt);
        CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(createdAt);
      `);
    }
  },
  {
    version: 4,
    name: "backup history",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_runs (
          id TEXT PRIMARY KEY,
          startedAt TEXT NOT NULL,
          finishedAt TEXT,
          status TEXT NOT NULL CHECK(status IN ('RUNNING', 'OK', 'FAILED')),
          /** Where the copy went: "local" or "local+s3". */
          target TEXT NOT NULL,
          databaseBytes INTEGER,
          uploadedFiles INTEGER,
          error TEXT
        );
        -- Photos already copied to the bucket, so each backup only sends new ones.
        CREATE TABLE IF NOT EXISTS backup_uploaded_files (
          name TEXT PRIMARY KEY,
          uploadedAt TEXT NOT NULL
        );
      `);
    }
  }
];

/** Applies every migration newer than the database, each in its own transaction. Returns the names applied. */
export function migrate(db: Database, list: Migration[] = migrations) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)");
  const applied = new Set((db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((row) => row.version));
  const done: string[] = [];

  for (const migration of [...list].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    // PRAGMA foreign_keys is ignored inside a transaction, so it's switched around it.
    if (migration.withoutForeignKeys) db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        migration.up(db);
        if (migration.withoutForeignKeys) {
          const problems = db.pragma("foreign_key_check") as unknown[];
          if (problems.length) throw new Error(`Migration ${migration.version} left ${problems.length} broken foreign keys`);
        }
        db.prepare("INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ?)").run(migration.version, migration.name, new Date().toISOString());
      })();
    } finally {
      if (migration.withoutForeignKeys) db.pragma("foreign_keys = ON");
    }
    done.push(`${migration.version} ${migration.name}`);
  }
  return done;
}
