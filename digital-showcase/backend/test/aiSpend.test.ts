import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-ai-spend-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { createStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { modelPrice, requestCostUsd } = await import("../src/services/aiPrices.js");
const { monthSpend, recordUsage, spendReport } = await import("../src/services/aiUsageService.js");

await initDatabase();
const db = await getDb();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000002", password: "secret123" }))!;
const current = { text: "gpt-5.6-luna", preview: "gpt-image-2.5-flare" };

test("цены моделей: снимки и имена OpenRouter, у неизвестной модели цены нет", () => {
  assert.deepEqual(modelPrice("gpt-5.6-luna"), { input: 0.2, output: 1.2 });
  assert.deepEqual(modelPrice("openai/gpt-5.6-luna-2026-08-01"), modelPrice("gpt-5.6-luna"));
  assert.equal(modelPrice("gpt-5.6-luna-pro"), null);
  assert.equal(modelPrice("yandexgpt"), null);
  assert.equal(requestCostUsd("gpt-5.6-terra", 1_000_000, 1_000_000), 14);
});

test("расход за месяц в рублях: карточка, превью и самое дорогое превью", async () => {
  process.env.AI_RUB_PER_USD = "100";
  const store = (await createStore({ ownerId: owner.id, name: "ИИ", slug: "ai-spend", aiFormEnabled: 1 }))!;
  // On Luna 1 500 + 1 000 tokens are $0.0015 — 0.15 ₽ a card; a bulk of two cards costs twice that.
  await recordUsage(store.id, "DRAFT", 1, { inputTokens: 1500, outputTokens: 1000, model: "gpt-5.6-luna" });
  await recordUsage(store.id, "BULK", 2, { inputTokens: 3000, outputTokens: 2000, model: "gpt-5.6-luna" });
  // A row saved before the model was recorded is priced by the model in use now.
  await db.run(
    "INSERT INTO ai_usage (id, storeId, kind, units, inputTokens, outputTokens, createdAt) VALUES ('old', ?, 'DRAFT', 1, 1500, 1000, ?)",
    store.id,
    new Date().toISOString()
  );
  // Pictures: 2.24 ₽ and 1.70 ₽.
  await recordUsage(store.id, "PREVIEW", 1, { inputTokens: 1300, outputTokens: 400, model: "gpt-image-2.5-flare" });
  await recordUsage(store.id, "PREVIEW", 1, { inputTokens: 1000, outputTokens: 300, model: "gpt-image-2.5-flare" });
  // No price — named, not summed; no tokens reported — nothing to learn from.
  await recordUsage(store.id, "DRAFT", 1, { inputTokens: 900, outputTokens: 900, model: "yandexgpt" });
  await recordUsage(store.id, "DRAFT", 1, { inputTokens: 0, outputTokens: 0, model: "gpt-5.6-luna" });

  assert.deepEqual(await monthSpend(current), {
    rubPerUsd: 100,
    previews: 2,
    costRub: 5,
    cardRub: 0.15,
    previewRub: 1.97,
    previewMaxRub: 2.24,
    unpricedModels: ["yandexgpt"]
  });

  delete process.env.AI_RUB_PER_USD;
  const withoutRate = await monthSpend(current);
  assert.equal(withoutRate.costRub, null);
  assert.equal(withoutRate.cardRub, null);
  assert.equal(withoutRate.previewMaxRub, null);
  assert.equal(withoutRate.previews, 2);
});

test("«Расходы на ИИ»: полгода по месяцам и этот месяц по магазинам", async () => {
  process.env.AI_RUB_PER_USD = "100";
  const store = (await db.get<{ id: string }>("SELECT id FROM stores WHERE slug = 'ai-spend'"))!;
  const now = new Date();
  // Two months ago: one card on Luna, 0.15 ₽.
  await db.run(
    "INSERT INTO ai_usage (id, storeId, kind, units, inputTokens, outputTokens, model, createdAt) VALUES ('past', ?, 'DRAFT', 1, 1500, 1000, 'gpt-5.6-luna', ?)",
    store.id,
    new Date(now.getFullYear(), now.getMonth() - 2, 15).toISOString()
  );

  const report = await spendReport(current, now);
  assert.equal(report.months.length, 6);
  const [lastMonth, twoMonthsAgo, oneMonthAgo] = [report.months[5], report.months[3], report.months[4]];
  // This month (from the test above): 6 cards — drafts, a bulk of 2, the unpriced and the empty one — and 2 previews.
  assert.deepEqual(lastMonth, { month: lastMonth.month, cards: 6, previews: 2, costRub: 4.54 });
  assert.deepEqual(twoMonthsAgo, { month: twoMonthsAgo.month, cards: 1, previews: 0, costRub: 0.15 });
  assert.deepEqual(oneMonthAgo, { month: oneMonthAgo.month, cards: 0, previews: 0, costRub: 0 });

  assert.deepEqual(report.stores, [{ storeId: store.id, name: "ИИ", cards: 6, previews: 2, used: 8, limit: 100, costRub: 4.54 }]);
  assert.deepEqual(report.unpricedModels, ["yandexgpt"]);
  delete process.env.AI_RUB_PER_USD;
  assert.equal((await spendReport(current, now)).months[5].costRub, null);
});

test("«Токены по запросам»: сколько берёт запрос каждого вида — в среднем, меньше и больше всего", async () => {
  process.env.AI_RUB_PER_USD = "100";
  const store = (await db.get<{ id: string }>("SELECT id FROM stores WHERE slug = 'ai-spend'"))!;
  // «Вручную + ИИ»: one field, 400 + 100 tokens on Luna — 0.02 ₽.
  await recordUsage(store.id, "DRAFT", 1, { inputTokens: 400, outputTokens: 100, model: "gpt-5.6-luna" }, "title");

  const { requests } = await spendReport(current);
  assert.deepEqual(requests, [
    // Four cards this month; the one without a token count isn't averaged, the unpriced one has no rubles.
    { request: "CARD", count: 4, avgInput: 1300, avgOutput: 967, avgTokens: 2267, minTokens: 1800, maxTokens: 2500, avgRub: 0.15, minRub: 0.15, maxRub: 0.15 },
    { request: "FIELD", count: 1, avgInput: 400, avgOutput: 100, avgTokens: 500, minTokens: 500, maxTokens: 500, avgRub: 0.02, minRub: 0.02, maxRub: 0.02 },
    { request: "BULK", count: 1, avgInput: 3000, avgOutput: 2000, avgTokens: 5000, minTokens: 5000, maxTokens: 5000, avgRub: 0.3, minRub: 0.3, maxRub: 0.3 },
    { request: "PREVIEW", count: 2, avgInput: 1150, avgOutput: 350, avgTokens: 1500, minTokens: 1300, maxTokens: 1700, avgRub: 1.97, minRub: 1.7, maxRub: 2.24 }
  ]);
  delete process.env.AI_RUB_PER_USD;
  assert.equal((await spendReport(current)).requests[0].avgRub, null, "no rate — tokens only");
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
