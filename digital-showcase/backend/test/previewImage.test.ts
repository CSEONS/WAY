import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviewPrompt, parsePreviewOptions } from "../src/services/previewImageService.js";

const options = (value: Record<string, unknown> = {}) => parsePreviewOptions(JSON.stringify(value));

test("по умолчанию: товар с фото, надписи и фон подбирает ИИ, формат 4:5", () => {
  const prompt = buildPreviewPrompt(options({ title: "Льняное платье", category: "Платья" }));
  assert.match(prompt, /4:5 aspect ratio/);
  assert.match(prompt, /Image 1 is a photo of the product being sold/);
  assert.match(prompt, /the exact product from Image 1 \("Льняное платье", Платья\), centered, front view/);
  assert.match(prompt, /Write a short catchy headline in Russian/);
  assert.match(prompt, /3–4 round icons on the left side, each showing one of the product's most relevant benefits/);
  assert.match(prompt, /Choose automatically whatever fits the product best: background scene and lighting, color palette and icon style\./);
  assert.match(prompt, /Avoid: .*changes to the product's design, color or proportions/);
});

test("выбранные сцена, тема, заголовок и преимущества попадают в промпт", () => {
  const prompt = buildPreviewPrompt(options({ scene: "winter", theme: "gold", headline: "Зимняя куртка", features: ["warm", "water"] }));
  assert.match(prompt, /Background: snowy mountains .*, bright cold daylight, light falling snow\./);
  assert.match(prompt, /Headline text "Зимняя куртка" exactly as written/);
  assert.match(prompt, /bold 3D text in dark navy/);
  assert.match(prompt, /Two round icons on the left side, black circles with gold rim: snowflake icon with caption "Тёплая", water drop icon with caption "Влагозащитная"\./);
  assert.match(prompt, /warm color mood/);
  assert.doesNotMatch(prompt, /Choose automatically/);
});

test("новые цвета оформления: неоновая и эко-зелёная попадают в промпт", () => {
  const neon = buildPreviewPrompt(options({ theme: "neon" }));
  assert.match(neon, /bold 3D text in hot pink/);
  assert.match(neon, /glowing neon circles on a dark background/);
  assert.match(neon, /vibrant color mood/);
  const eco = buildPreviewPrompt(options({ theme: "eco", text: "no_text" }));
  assert.match(eco, /natural color mood/);
  // The scene is still the model's choice, the colors are not.
  assert.doesNotMatch(eco, /Choose automatically[^\n]*color mood/);
});

test("без надписей — ни текста, ни иконок", () => {
  const prompt = buildPreviewPrompt(options({ text: "no_text", scene: "studio", features: ["warm"], headline: "Не попадёт" }));
  assert.match(prompt, /No text, letters, numbers, icons or badges anywhere in the image/);
  assert.doesNotMatch(prompt, /headline|icons on the left|Не попадёт/i);
  assert.match(prompt, /Avoid: .*any text, letters, numbers\./);
});

test("все цвета показываются, только если их больше одного и владелец попросил", () => {
  assert.match(buildPreviewPrompt(options({ showColors: true, colors: ["чёрный", "синий", "чёрный"] })), /shown as two color variants side by side: чёрный, синий/);
  assert.match(buildPreviewPrompt(options({ showColors: true, colors: ["чёрный"] })), /centered, front view/);
  assert.match(buildPreviewPrompt(options({ colors: ["чёрный", "синий"] })), /centered, front view/);
});

test("кавычки и переносы владельца не ломают промпт", () => {
  const prompt = buildPreviewPrompt(options({ title: 'Платье "Лето"\nновое', headline: "«Хит»" }));
  assert.match(prompt, /\("Платье Лето новое"\)/);
  assert.match(prompt, /Headline text "Хит" exactly/);
});

test("неверные настройки — понятная ошибка 400", () => {
  assert.throws(() => parsePreviewOptions("{нет"), (error: { status?: number }) => error.status === 400);
  assert.throws(() => options({ scene: "mars" }), (error: { status?: number }) => error.status === 400);
  assert.throws(() => options({ features: ["warm", "water", "wind", "light", "eco"] }), (error: { status?: number }) => error.status === 400);
  assert.throws(() => options({ headline: "x".repeat(41) }), (error: { status?: number }) => error.status === 400);
  assert.deepEqual(parsePreviewOptions(undefined).features, []);
});
