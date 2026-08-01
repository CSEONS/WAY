import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBulkProductDrafts } from "../src/services/aiDraftService.js";
import { createOwner } from "../src/services/userService.js";

test("группирует сценарий из TODO в три товара и заполняет неизвестные поля", () => {
  const response = JSON.stringify({
    products: [
      { title: "Джинсы", colors: ["синий", "черный"], imageIndexes: [0, 1, 2] },
      { title: "Свитер", imageIndexes: [3] },
      { title: "Пиджак", imageIndexes: [4, 5] }
    ]
  });

  const drafts = normalizeBulkProductDrafts(response, 6);

  assert.equal(drafts.length, 3);
  assert.deepEqual(drafts.map(({ title, imageIndexes }) => ({ title, imageIndexes })), [
    { title: "Джинсы", imageIndexes: [0, 1, 2] },
    { title: "Свитер", imageIndexes: [3] },
    { title: "Пиджак", imageIndexes: [4, 5] }
  ]);
  for (const draft of drafts) {
    assert.equal(draft.price, null);
    assert.equal(draft.priceText, "Уточнить у продавца");
    assert.deepEqual(draft.sizes, ["Уточнить у продавца"]);
    assert.equal(draft.status, "CHECK_IN_STORE");
  }
});

test("каждое изображение назначается только один раз", () => {
  const response = JSON.stringify({ products: [
    { title: "Первый", imageIndexes: [0, 1, 1] },
    { title: "Второй", imageIndexes: [1, 2] }
  ] });

  const drafts = normalizeBulkProductDrafts(response, 4);

  assert.deepEqual(drafts[0].imageIndexes, [0, 1, 3]);
  assert.deepEqual(drafts[1].imageIndexes, [2]);
});

test("создание владельца отклоняет пароль короче 6 символов", async () => {
  await assert.rejects(() => createOwner({ name: "Тест", password: "12345" }), /минимум 6 символов/);
});
