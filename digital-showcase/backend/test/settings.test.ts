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
const { trialEnd, trialPeriod } = await import("../src/services/subscriptionService.js");
const { parseBody, settingsSchema } = await import("../src/utils/validation.js");

await initDatabase();
settingsService.loadSettings();

test("пока админ ничего не сохранил, действуют старые значения из .env", () => {
  const current = settingsService.settings();
  assert.deepEqual(current.trial, { count: 7, unit: "days" });
  assert.equal(current.aiModel, "gpt-4o");
  assert.equal(current.aiPreviewEnabled, false);
  assert.equal(current.support.whatsapp, "+79280000000");
  assert.equal(previewSettings(), null);
});

test("форма настроек: курс и ссылки читаются как их вводят люди", () => {
  const input = { ...settingsService.settings(), aiRubPerUsd: "92,5", trial: { count: "1", unit: "months" } };
  const parsed = parseBody(settingsSchema, input);
  assert.equal(parsed.aiRubPerUsd, 92.5);
  assert.deepEqual(parsed.trial, { count: 1, unit: "months" });
  assert.equal(parseBody(settingsSchema, { ...input, aiRubPerUsd: "" }).aiRubPerUsd, null);

  assert.throws(() => parseBody(settingsSchema, { ...input, trial: { count: 0, unit: "days" } }), /Пробный период/);
  assert.throws(() => parseBody(settingsSchema, { ...input, trial: { count: 13, unit: "months" } }), /не больше 12 месяцев/);
  assert.throws(() => parseBody(settingsSchema, { ...input, helpVideos: [{ title: "Как добавить товар", url: "youtube" }] }), /Ссылка.*https/);
});

test("сохранённые настройки важнее .env и переживают перезапуск", () => {
  const current = settingsService.settings();
  settingsService.saveSettings({
    ...current,
    trial: { count: 1, unit: "months" },
    aiModel: "gpt-5.6-luna",
    aiPreviewEnabled: true,
    aiPreviewQuality: "low",
    support: { whatsapp: "", phone: "+79281112233", telegram: "" }
  });
  settingsService.loadSettings();

  assert.deepEqual(trialPeriod(), { count: 1, unit: "months" });
  // A calendar month: 31 January + 1 month = the last day of February.
  assert.equal(trialEnd(trialPeriod(), new Date(2026, 0, 31, 12)).getDate(), 28);
  assert.equal(trialEnd({ count: 14, unit: "days" }, new Date(2026, 0, 31, 12)).getDate(), 14);
  assert.equal(aiSettings().model, "gpt-5.6-luna");
  assert.equal(previewSettings()?.quality, "low");

  const visible = settingsService.publicSettings();
  assert.equal(visible.legal.keepDataDays, 90);
  assert.ok(!("support" in visible) && !("aiModel" in visible), "контакты поддержки и модели — только для админа");
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
