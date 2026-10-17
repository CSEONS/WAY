import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-settings-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
// Old .env settings: the starting values until the admin saves.
process.env.TRIAL_DAYS = "7";
process.env.AI_MODEL = "gpt-4o";
process.env.AI_PREVIEW_MODEL = "off";
process.env.SUPPORT_WHATSAPP = "+79280000000";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const settingsService = await import("../src/services/settingsService.js");
const { aiSettings, previewSettings } = await import("../src/services/aiProvider.js");
const { monthlyLimit } = await import("../src/services/aiUsageService.js");
const { trialDays } = await import("../src/services/subscriptionService.js");
const { parseBody, settingsSchema } = await import("../src/utils/validation.js");

await initDatabase();
settingsService.loadSettings();

test("пока админ ничего не сохранил, действуют старые значения из .env", () => {
  const current = settingsService.settings();
  assert.equal(current.trialDays, 7);
  assert.equal(current.aiModel, "gpt-4o");
  assert.equal(current.aiPreviewEnabled, false);
  assert.equal(current.support.whatsapp, "+79280000000");
  assert.equal(current.aiMonthlyLimit, 100);
  assert.equal(previewSettings(), null);
});

test("форма настроек: цены, курс и ссылки читаются как их вводят люди", () => {
  const input = {
    ...settingsService.settings(),
    plans: {
      basic: { name: "Витрина", price: "500", description: "", features: ["Ссылка на витрину"] },
      ai: { name: "Витрина + ИИ", price: "1 000", description: "", features: [] }
    },
    aiRubPerUsd: "92,5",
    trialDays: "14"
  };
  const parsed = parseBody(settingsSchema, input);
  assert.equal(parsed.plans.basic.price, 500);
  assert.equal(parsed.plans.ai.price, 1000);
  assert.equal(parsed.aiRubPerUsd, 92.5);
  assert.equal(parsed.trialDays, 14);
  assert.equal(parseBody(settingsSchema, { ...input, plans: { ...input.plans, basic: { ...input.plans.basic, price: "" } } }).plans.basic.price, null);

  assert.throws(() => parseBody(settingsSchema, { ...input, trialDays: 0 }), /Пробный период/);
  assert.throws(() => parseBody(settingsSchema, { ...input, helpVideos: [{ title: "Как добавить товар", url: "youtube" }] }), /Ссылка.*https/);
});

test("сохранённые настройки важнее .env и переживают перезапуск", () => {
  const current = settingsService.settings();
  settingsService.saveSettings({
    ...current,
    plans: { ...current.plans, basic: { ...current.plans.basic, price: 500 } },
    trialDays: 10,
    aiMonthlyLimit: 50,
    aiModel: "gpt-5.6-luna",
    aiPreviewEnabled: true,
    aiPreviewQuality: "low",
    support: { whatsapp: "", phone: "+79281112233", telegram: "" }
  });
  settingsService.loadSettings();

  assert.equal(trialDays(), 10);
  assert.equal(monthlyLimit({ aiMonthlyLimit: null }), 50);
  assert.equal(monthlyLimit({ aiMonthlyLimit: 5 }), 5);
  assert.equal(aiSettings().model, "gpt-5.6-luna");
  assert.equal(previewSettings()?.quality, "low");
  assert.equal(settingsService.settings().plans.basic.price, 500);

  const visible = settingsService.publicSettings();
  assert.equal(visible.plans.basic.price, 500);
  assert.equal(visible.aiMonthlyLimit, 50);
  assert.ok(!("support" in visible) && !("aiModel" in visible), "контакты поддержки и модели — только для админа");
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
