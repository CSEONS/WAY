import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-plans-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "test-password";
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const plans = await import("../src/services/planService.js");
const { createStore, getStoreBySlug, updateStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { monthlyLimit } = await import("../src/services/aiUsageService.js");
const { parseBody, planSchema } = await import("../src/utils/validation.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000004", password: "secret123" }))!;

const pro = {
  name: "Про",
  price: 2000,
  description: "Для нескольких точек",
  features: ["Всё из «Витрина + ИИ»", "Запуск под ключ"],
  aiEnabled: 1,
  aiMonthlyLimit: 300,
  highlighted: 1,
  isPublic: 1
};

test("новая база: два тарифа — без ИИ и с ИИ, у второго лимит 100", async () => {
  const list = await plans.listPlans();
  assert.deepEqual(
    list.map((plan) => [plan.id, plan.name, plan.aiEnabled, plan.aiMonthlyLimit, plan.highlighted]),
    [
      ["basic", "Витрина", 0, null, 0],
      ["ai", "Витрина + ИИ", 1, 100, 1]
    ]
  );
  // Filling products in for the owner is a paid package, not a plan feature.
  assert.ok(!list.some((plan) => plan.features.some((feature) => /Поможем/.test(feature))));
  assert.deepEqual((await plans.publicPlans()).map((plan) => [plan.name, plan.aiMonthlyLimit, plan.highlighted]), [
    ["Витрина", null, false],
    ["Витрина + ИИ", 100, true]
  ]);
});

test("магазин получает тариф, а его ИИ и лимит следуют тарифу", async () => {
  const basic = (await createStore({ ownerId: owner.id, name: "Без ИИ", slug: "plan-basic" }))!;
  assert.equal(basic.planId, "basic");
  assert.equal(basic.aiFormEnabled, 0);
  assert.equal(monthlyLimit(basic), 0);
  // Older callers only know the AI switch: it picks the first plan with AI.
  const withAi = (await createStore({ ownerId: owner.id, name: "С ИИ", slug: "plan-ai", aiFormEnabled: 1 }))!;
  assert.equal(withAi.planId, "ai");
  assert.equal(monthlyLimit(withAi), 100);

  const created = await plans.savePlan(null, pro);
  const moved = (await updateStore(basic.id, { planId: created.id }))!;
  assert.equal(moved.aiFormEnabled, 1);
  assert.equal(monthlyLimit(moved), 300);
  // A store's own limit beats the plan's.
  assert.equal(monthlyLimit({ ...moved, aiMonthlyLimit: 5 }), 5);

  // The plan loses AI: its stores lose it too, at once.
  await plans.savePlan(created.id, { ...pro, aiEnabled: 0 });
  const after = plans.planOf(moved)!;
  assert.equal(after.aiMonthlyLimit, null);
  assert.equal((await updateStore(moved.id, {}))!.aiFormEnabled, 0);
  assert.equal(monthlyLimit(moved), 0);

  await assert.rejects(updateStore(basic.id, { planId: "missing" }), /Такого тарифа нет/);
});

test("выделен один тариф, скрытый не виден на лендинге, порядок задаёт админ", async () => {
  const list = await plans.listPlans();
  const created = list.find((plan) => plan.name === "Про")!;
  // «Про» was saved highlighted: «Витрина + ИИ» isn't any more.
  assert.deepEqual(list.filter((plan) => plan.highlighted).map((plan) => plan.name), ["Про"]);

  await plans.savePlan(created.id, { ...pro, aiEnabled: 0, highlighted: 0, isPublic: 0 });
  assert.ok(!(await plans.publicPlans()).some((plan) => plan.name === "Про"));

  const reordered = await plans.reorderPlans(["ai", "basic", created.id]);
  assert.deepEqual(reordered.map((plan) => plan.id), ["ai", "basic", created.id]);
});

test("удалить можно только тариф, на котором нет магазинов", async () => {
  const created = (await plans.listPlans()).find((plan) => plan.name === "Про")!;
  assert.equal(created.storeCount, 1);
  await assert.rejects(plans.deletePlan(created.id), /магазинов: 1/);

  // Its store moves to another plan — then the plan can go.
  const store = (await getStoreBySlug("plan-basic"))!;
  await updateStore(store.id, { planId: "basic" });
  await plans.deletePlan(created.id);
  assert.ok(!(await plans.listPlans()).some((plan) => plan.id === created.id));
});

test("форма тарифа: цена «1 500», тариф с ИИ без лимита не сохранить", () => {
  const parsed = parseBody(planSchema, { ...pro, price: "1 500", aiMonthlyLimit: "", aiEnabled: false });
  assert.equal(parsed.price, 1500);
  assert.equal(parsed.aiEnabled, 0);
  assert.throws(() => parseBody(planSchema, { ...pro, aiMonthlyLimit: "" }), /сколько карточек с ИИ/);
  assert.equal(parseBody(planSchema, { ...pro, price: "" }).price, null);
});

test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
