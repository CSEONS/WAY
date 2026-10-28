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
  },
  {
    version: 5,
    name: "receipts for payments",
    up(db) {
      // Link to the receipt in «Мой налог» (self-employed) or a receipt number.
      addColumn(db, "payments", "receipt", "TEXT");
    }
  },
  {
    version: 6,
    name: "ai previews in usage",
    // SQLite can't change a CHECK: the table is rebuilt with 'PREVIEW' allowed.
    withoutForeignKeys: true,
    up(db) {
      db.exec(`
        CREATE TABLE ai_usage_new (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK(kind IN ('DRAFT', 'BULK', 'PREVIEW')),
          units INTEGER NOT NULL,
          inputTokens INTEGER NOT NULL DEFAULT 0,
          outputTokens INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL
        );
        INSERT INTO ai_usage_new (id, storeId, kind, units, inputTokens, outputTokens, createdAt)
          SELECT id, storeId, kind, units, inputTokens, outputTokens, createdAt FROM ai_usage;
        DROP TABLE ai_usage;
        ALTER TABLE ai_usage_new RENAME TO ai_usage;
        CREATE INDEX IF NOT EXISTS ai_usage_store ON ai_usage(storeId, createdAt);
      `);
    }
  },
  {
    version: 7,
    name: "ai usage remembers the model",
    // Its price turns tokens into rubles; older rows are priced by the model in use now.
    up(db) {
      addColumn(db, "ai_usage", "model", "TEXT");
    }
  },
  {
    version: 8,
    name: "settings from the admin panel",
    // One row per setting, the value as JSON (see settingsService).
    up(db) {
      db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt TEXT NOT NULL)");
    }
  },
  {
    version: 9,
    name: "moderation of photos with living beings",
    // One row per photo or logo where the AI found people or animals (see imageModerationService).
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS image_checks (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL CHECK(kind IN ('PRODUCT', 'LOGO')),
          storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          productId TEXT REFERENCES products(id) ON DELETE CASCADE,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
          findings TEXT NOT NULL DEFAULT '',
          createdAt TEXT NOT NULL,
          reviewedBy TEXT,
          reviewedAt TEXT
        );
        CREATE INDEX IF NOT EXISTS image_checks_status ON image_checks(status, createdAt);
      `);
    }
  },
  {
    version: 10,
    name: "plans as a table",
    // Plans used to be two fixed entries in settings («Витрина» and «Витрина + ИИ»)
    // and a store only had its AI switch. Now any number of plans live here and a
    // store points at one; its AI switch is copied from the plan (see planService).
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS plans (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price REAL,
          description TEXT NOT NULL DEFAULT '',
          features TEXT NOT NULL DEFAULT '[]',
          aiEnabled INTEGER NOT NULL DEFAULT 0,
          aiMonthlyLimit INTEGER,
          highlighted INTEGER NOT NULL DEFAULT 0,
          isPublic INTEGER NOT NULL DEFAULT 1,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);
      addColumn(db, "stores", "planId", "TEXT REFERENCES plans(id)");

      // The two plans as the admin last saved them on «Тарифы и цены», or as a new installation had them.
      const saved = (key: string): unknown => {
        const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
        try {
          return row ? JSON.parse(row.value) : undefined;
        } catch {
          return undefined;
        }
      };
      type SavedPlan = { name?: string; price?: number | null; description?: string; features?: string[] };
      const savedPlans = (saved("plans") ?? {}) as { basic?: SavedPlan; ai?: SavedPlan };
      const envLimit = Number(process.env.AI_MONTHLY_LIMIT);
      const savedLimit = Number(saved("aiMonthlyLimit"));
      const limit = Number.isInteger(savedLimit) && savedLimit >= 0 ? savedLimit : Number.isInteger(envLimit) && envLimit >= 0 ? envLimit : 100;
      const defaults = {
        basic: {
          name: "Витрина",
          price: null,
          description: "Каталог магазина по ссылке — всё, чтобы покупатели писали вам.",
          features: [
            "Ссылка на витрину и QR-плакат для кассы",
            "Товары с фото, размерами, цветами и ценами",
            "Кнопки WhatsApp, Telegram и звонка",
            "Статистика и отчёт за месяц",
            "Поможем запуститься и добавить первые товары"
          ]
        },
        ai: {
          name: "Витрина + ИИ",
          price: null,
          description: "То же, плюс ИИ-помощник: товар добавляется по фото и голосу за полминуты.",
          features: ["Всё из тарифа «Витрина»", "Карточка товара по фото и голосовому описанию", "Много товаров сразу: ИИ сам разберёт фото по карточкам"]
        }
      };
      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO plans (id, name, price, description, features, aiEnabled, aiMonthlyLimit, highlighted, isPublic, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      );
      for (const [index, key] of (["basic", "ai"] as const).entries()) {
        const plan = { ...defaults[key], ...savedPlans[key] };
        const isAi = key === "ai";
        insert.run(key, plan.name, plan.price ?? null, plan.description ?? "", JSON.stringify(plan.features ?? []), isAi ? 1 : 0, isAi ? limit : null, isAi ? 1 : 0, index, now, now);
      }
      db.exec(`
        UPDATE stores SET planId = CASE WHEN aiFormEnabled = 1 THEN 'ai' ELSE 'basic' END WHERE planId IS NULL;
        DELETE FROM settings WHERE key IN ('plans', 'aiMonthlyLimit');
      `);
    }
  },
  {
    version: 11,
    name: "trial in days or months",
    // The saved «trialDays» setting becomes «trial»: { count, unit }.
    up(db) {
      const row = db.prepare("SELECT value, updatedAt FROM settings WHERE key = 'trialDays'").get() as { value: string; updatedAt: string } | undefined;
      if (!row) return;
      const days = Number(JSON.parse(row.value));
      if (Number.isInteger(days) && days > 0) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES ('trial', ?, ?)").run(JSON.stringify({ count: days, unit: "days" }), row.updatedAt);
      }
      db.prepare("DELETE FROM settings WHERE key = 'trialDays'").run();
    }
  },
  {
    version: 12,
    name: "add-on packages",
    // Packages bought on top of a plan (see packageService): AI previews and AI
    // cards that don't burn at the month's end, a service the admin does, or both.
    // A sale is also a payment, but extends nothing: payments get packageName and
    // an empty paid date is allowed (the table is rebuilt, SQLite can't drop NOT NULL).
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS packages (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price INTEGER NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          previews INTEGER NOT NULL DEFAULT 0,
          fills INTEGER NOT NULL DEFAULT 0,
          isService INTEGER NOT NULL DEFAULT 0,
          isPublic INTEGER NOT NULL DEFAULT 1,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        -- An owner's request or an admin's sale. What was bought is copied: the package may change or go later.
        CREATE TABLE IF NOT EXISTS package_orders (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
          packageId TEXT,
          name TEXT NOT NULL,
          price INTEGER NOT NULL,
          previews INTEGER NOT NULL DEFAULT 0,
          fills INTEGER NOT NULL DEFAULT 0,
          isService INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK(status IN ('REQUESTED', 'PAID', 'DONE', 'DECLINED', 'CANCELLED')),
          paymentId TEXT,
          createdAt TEXT NOT NULL,
          paidAt TEXT,
          doneAt TEXT
        );
        CREATE INDEX IF NOT EXISTS package_orders_store ON package_orders(storeId, createdAt);
        CREATE INDEX IF NOT EXISTS package_orders_status ON package_orders(status, createdAt);

        CREATE TABLE payments_new (
          id TEXT PRIMARY KEY,
          storeId TEXT NOT NULL,
          storeName TEXT NOT NULL,
          amount INTEGER NOT NULL,
          months INTEGER NOT NULL,
          method TEXT NOT NULL CHECK(method IN ('CASH', 'TRANSFER', 'OTHER')),
          comment TEXT,
          periodStart TEXT,
          periodEnd TEXT,
          createdBy TEXT,
          createdAt TEXT NOT NULL,
          receipt TEXT,
          packageName TEXT
        );
        INSERT INTO payments_new (id, storeId, storeName, amount, months, method, comment, periodStart, periodEnd, createdBy, createdAt, receipt)
          SELECT id, storeId, storeName, amount, months, method, comment, periodStart, periodEnd, createdBy, createdAt, receipt FROM payments;
        DROP TABLE payments;
        ALTER TABLE payments_new RENAME TO payments;
        CREATE INDEX IF NOT EXISTS payments_store ON payments(storeId, createdAt);
      `);
      // What packages left the store; spent only once the month's plan limit is.
      addColumn(db, "stores", "extraPreviews", "INTEGER NOT NULL DEFAULT 0");
      addColumn(db, "stores", "extraFills", "INTEGER NOT NULL DEFAULT 0");
      // Units of a request counted against the plan's month and units paid by packages instead.
      addColumn(db, "ai_usage", "planUnits", "INTEGER");
      addColumn(db, "ai_usage", "packageUnits", "INTEGER NOT NULL DEFAULT 0");
      db.exec("UPDATE ai_usage SET planUnits = units WHERE planUnits IS NULL");

      // Examples from the owner's wishes, hidden until the admin checks the prices and shows them.
      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO packages (id, name, price, description, previews, fills, isService, isPublic, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      );
      const examples = [
        ["previews-10", "+10 ИИ-превью", 100, "Обложки для товаров, когда превью тарифа на месяц закончились", 10, 0, 0],
        ["fills-100", "+100 карточек с ИИ", 200, "Карточки по фото и голосу сверх лимита тарифа", 0, 100, 0],
        ["setup-help", "Помощь с первым заполнением", 1000, "Добавим первые товары за вас: фото, описания, размеры и цены", 0, 0, 1]
      ] as const;
      for (const [index, example] of examples.entries()) insert.run(...example, index, now, now);
    }
  },
  {
    version: 13,
    name: "no free help with products in plans",
    // Filling products in for the owner is a paid package now («Помощь с первым
    // заполнением»), not part of a plan: the line plans got by default goes.
    up(db) {
      const line = "Поможем запуститься и добавить первые товары";
      const rows = db.prepare("SELECT id, features FROM plans").all() as { id: string; features: string }[];
      const update = db.prepare("UPDATE plans SET features = ? WHERE id = ?");
      for (const row of rows) {
        let features: unknown;
        try {
          features = JSON.parse(row.features);
        } catch {
          continue;
        }
        if (!Array.isArray(features) || !features.includes(line)) continue;
        update.run(JSON.stringify(features.filter((feature) => feature !== line)), row.id);
      }
    }
  },
  {
    version: 14,
    name: "instagram and vk of a store",
    // The owner's networks besides WhatsApp and Telegram: «Поделиться» on their product offers them.
    up(db) {
      addColumn(db, "stores", "instagram", "TEXT");
      addColumn(db, "stores", "vk", "TEXT");
    }
  },
  {
    version: 15,
    name: "no demo store setting",
    // «Посмотреть пример» and its demo store are gone; the saved address of it goes too.
    up(db) {
      db.prepare("DELETE FROM settings WHERE key = 'demoStoreSlug'").run();
    }
  },
  {
    version: 16,
    name: "notifications and products taken off by the admin",
    up(db) {
      db.exec(`
        -- The bell in the owner's app: from the system (photo checks) or the admin (see notificationService).
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          storeId TEXT REFERENCES stores(id) ON DELETE CASCADE,
          source TEXT NOT NULL CHECK(source IN ('SYSTEM', 'ADMIN')),
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          link TEXT,
          topic TEXT,
          batchId TEXT,
          createdAt TEXT NOT NULL,
          readAt TEXT
        );
        CREATE INDEX IF NOT EXISTS notifications_user ON notifications(userId, createdAt);
        CREATE INDEX IF NOT EXISTS notifications_batch ON notifications(batchId);
      `);
      // A product the admin took off the storefront: buyers don't see it, whatever the owner's switch says.
      addColumn(db, "products", "blockedAt", "TEXT");
      addColumn(db, "products", "blockedReason", "TEXT");
    }
  },
  {
    version: 17,
    name: "month results on the full plan, stores no longer served",
    up(db) {
      // «Итоги в любой день»: the owner sees month results whenever; others get them in a notification at the month's end.
      addColumn(db, "plans", "reportsAnytime", "INTEGER NOT NULL DEFAULT 0");
      // «Отклонить» on an overdue store: the admin stopped serving it (the storefront is off too).
      addColumn(db, "stores", "servingEndedAt", "TEXT");
    }
  },
  {
    version: 18,
    name: "ai usage remembers the field asked for",
    up(db) {
      // «Вручную + ИИ» fills one field: «Расходы на ИИ» tells its tokens from a whole card's. Older rows count as cards.
      addColumn(db, "ai_usage", "field", "TEXT");
    }
  },
  {
    version: 19,
    name: "one price products without combinations",
    // A product priced «one price for everything» is now sizes and colors without combinations,
    // so buyers have nothing to pick. Older ones kept the full color × size grid at that price.
    up: dropOnePriceCombinations
  }
];

/**
 * Combinations of a product saved with one price for everything: a full
 * color × size grid, every one at the product's own price, none «Уточнить у
 * продавца». Its sizes and colors stay (added from the combinations if missing).
 * Different prices or a partial grid mean the owner priced combinations: kept.
 */
function dropOnePriceCombinations(db: Database) {
  const askSeller = "Уточнить у продавца";
  const products = db
    .prepare("SELECT id, price FROM products p WHERE EXISTS (SELECT 1 FROM product_variants v WHERE v.productId = p.id)")
    .all() as { id: string; price: number | null }[];
  for (const product of products) {
    const variants = db.prepare("SELECT colorName, colorHex, size, price FROM product_variants WHERE productId = ?").all(product.id) as {
      colorName: string;
      colorHex: string | null;
      size: string;
      price: number | null;
    }[];
    if (variants.some((variant) => variant.colorName === askSeller || variant.size === askSeller)) continue;
    if (variants.some((variant) => variant.price !== product.price)) continue;
    const colors = new Map(variants.map((variant) => [variant.colorName, variant.colorHex]));
    const sizes = new Set(variants.map((variant) => variant.size));
    const pairs = new Set(variants.map((variant) => `${variant.colorName}\u0000${variant.size}`));
    if (pairs.size !== colors.size * sizes.size) continue;

    const savedSizes = new Set((db.prepare("SELECT value FROM product_sizes WHERE productId = ?").all(product.id) as { value: string }[]).map((row) => row.value));
    const savedColors = new Set((db.prepare("SELECT name FROM product_colors WHERE productId = ?").all(product.id) as { name: string }[]).map((row) => row.name));
    for (const size of sizes) {
      if (!savedSizes.has(size)) db.prepare("INSERT INTO product_sizes (id, productId, value) VALUES (?, ?, ?)").run(crypto.randomUUID(), product.id, size);
    }
    for (const [name, hex] of colors) {
      if (!savedColors.has(name)) db.prepare("INSERT INTO product_colors (id, productId, name, hex) VALUES (?, ?, ?, ?)").run(crypto.randomUUID(), product.id, name, hex);
    }
    db.prepare("DELETE FROM product_variants WHERE productId = ?").run(product.id);
  }
}

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
