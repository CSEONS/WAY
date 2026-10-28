import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBulkProductDrafts } from "../src/services/aiDraftService.js";
import { colorHexForName, colorNamesIn, parseColorHex, resolveColorHex } from "../src/utils/colorHex.js";

test("код цвета от ИИ приводится к #rrggbb в любом виде", () => {
  assert.equal(parseColorHex("#1F2A44"), "#1f2a44");
  assert.equal(parseColorHex("1f2a44"), "#1f2a44");
  assert.equal(parseColorHex("#12a"), "#1122aa");
  assert.equal(parseColorHex("#1f2a44cc"), "#1f2a44");
  assert.equal(parseColorHex("rgb(31, 42, 68)"), "#1f2a44");
  assert.equal(parseColorHex("rgba(31,42,68,0.5)"), "#1f2a44");
  assert.equal(parseColorHex("тёмно-синий"), null);
  assert.equal(parseColorHex("rgb(300, 0, 0)"), null);
  assert.equal(parseColorHex(null), null);
});

test("код по названию: оттенки и составные цвета", () => {
  const blue = colorHexForName("синий")!;
  const darkBlue = colorHexForName("Тёмно-синий")!;
  const lightBlue = colorHexForName("светло синяя")!;
  assert.match(darkBlue, /^#[0-9a-f]{6}$/);
  assert.ok(brightness(darkBlue) < brightness(blue) && brightness(blue) < brightness(lightBlue));
  assert.equal(colorHexForName("синие"), blue);
  assert.match(colorHexForName("серо-голубой") ?? "", /^#[0-9a-f]{6}$/);
  assert.equal(colorHexForName("молочный"), "#f3ead8");
  assert.equal(colorHexForName("мультиколор"), null);
  assert.equal(colorHexForName("серебристый"), "#c0c0c0", "«серебристый» is not «серый»");
});

test("название вместо кода (частая ошибка ИИ) превращается в код", () => {
  assert.equal(resolveColorHex("#1F2A44", "тёмно-синий"), "#1f2a44");
  assert.equal(resolveColorHex("тёмно-синий", "тёмно-синий"), colorHexForName("тёмно-синий"));
  assert.equal(resolveColorHex(null, "бордовый"), "#7f1d1d");
});

test("цвета в тексте без ИИ: словарная форма, составные — как написаны", () => {
  assert.deepEqual(colorNamesIn("синее платье, есть тёмно-зелёное и синие"), ["синий", "тёмно-зелёное"]);
  assert.deepEqual(colorNamesIn("белье и серьги"), []);
});

test("черновик: у каждого цвета и варианта есть код, даже если ИИ написал название", () => {
  const [draft] = normalizeBulkProductDrafts(
    JSON.stringify({
      products: [
        {
          title: "Пиджак",
          colors: [{ name: "тёмно-синий", hex: "тёмно-синий" }, { name: "бежевый", hex: "rgb(214, 187, 152)" }, "графитовый"],
          imageIndexes: [0]
        }
      ]
    }),
    1
  );

  assert.deepEqual(draft.colors, [
    { name: "тёмно-синий", hex: colorHexForName("тёмно-синий") },
    { name: "бежевый", hex: "#d6bb98" },
    { name: "графитовый", hex: "#3f3f46" }
  ]);
  for (const variant of draft.variants) assert.match(variant.colorHex ?? "", /^#[0-9a-f]{6}$/);
});

function brightness(hex: string) {
  return [1, 3, 5].reduce((sum, start) => sum + parseInt(hex.slice(start, start + 2), 16), 0);
}
