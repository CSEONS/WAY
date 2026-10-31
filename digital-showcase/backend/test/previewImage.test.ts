import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { buildPreviewPrompt, drawColorSwatches, parsePreviewOptions } from "../src/services/previewImageService.js";
import { PREVIEW_STYLE_PRESETS } from "../src/services/previewStylePresets.js";

const options = (value: Record<string, unknown> = {}) => parsePreviewOptions(JSON.stringify(value));

test("по умолчанию: товар с фото, надписи и фон подбирает ИИ, формат 4:5", () => {
  const prompt = buildPreviewPrompt(options({ title: "Льняное платье", category: "Платья" }));
  assert.match(prompt, /4:5 aspect ratio/);
  assert.match(prompt, /Image 1 is a photo of the product being sold/);
  assert.match(prompt, /the exact product from Image 1 \("Льняное платье", Платья\)\./);
  assert.match(prompt, /Style: The product centered, front view/);
  assert.match(prompt, /Write a short catchy headline in Russian/);
  assert.match(prompt, /Text layout: headline in bold 3D letters/);
  assert.match(prompt, /3–4 benefit icons, each showing one of the product's most relevant benefits/);
  assert.match(prompt, /Choose automatically whatever fits the product best: background scene and lighting, color palette and icon style\./);
  assert.match(prompt, /Avoid: .*changes to the product's design, color or proportions/);
});

test("выбранные сцена, тема, заголовок и преимущества попадают в промпт", () => {
  const prompt = buildPreviewPrompt(options({ scene: "winter", theme: "gold", headline: "Зимняя куртка", features: ["warm", "water"] }));
  assert.match(prompt, /Background: snowy mountains .*, bright cold daylight, light falling snow\./);
  assert.match(prompt, /Headline text "Зимняя куртка" exactly as written/);
  assert.match(prompt, /headline in dark navy/);
  assert.match(prompt, /icons as black circles with gold rim/);
  assert.match(prompt, /Two benefit icons: snowflake icon with caption "Тёплая", water drop icon with caption "Влагозащитная"\./);
  assert.match(prompt, /warm color mood/);
  assert.doesNotMatch(prompt, /Choose automatically/);
});

test("новые цвета оформления: неоновая и эко-зелёная попадают в промпт", () => {
  const neon = buildPreviewPrompt(options({ theme: "neon" }));
  assert.match(neon, /headline in hot pink/);
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
  assert.doesNotMatch(prompt, /headline|benefit icons|Text layout|Не попадёт/i);
  assert.match(prompt, /Avoid: .*any text, letters, numbers\./);
});

test("все цвета показываются, только если их больше одного и владелец попросил", () => {
  assert.match(buildPreviewPrompt(options({ showColors: true, colors: ["чёрный", "синий", "чёрный"] })), /shown as two color variants side by side: чёрный, синий/);
  assert.doesNotMatch(buildPreviewPrompt(options({ showColors: true, colors: ["чёрный"] })), /color variants/);
  assert.doesNotMatch(buildPreviewPrompt(options({ colors: ["чёрный", "синий"] })), /color variants/);
});

test("стиль задаёт вид; выключенные в стиле выборы владельца не попадают в промпт", () => {
  const catalog = PREVIEW_STYLE_PRESETS.find((style) => style.id === "catalog")!;
  const prompt = buildPreviewPrompt(options({ scene: "winter", theme: "gold", headline: "Хит", features: ["warm"] }), catalog);
  assert.match(prompt, /Style: Clean e-commerce catalog photo/);
  assert.match(prompt, /No text, letters, numbers, icons or badges/, "a style without a text layout has no text");
  assert.doesNotMatch(prompt, /snowy mountains|dark navy|Хит|Choose automatically/);
  // The product and the storefront rules stay, whatever the style.
  assert.match(prompt, /reproduce this exact product closely/);
  assert.match(prompt, /Show no people/);
});

test("стиль с надписями без иконок: заголовок есть, иконок нет", () => {
  const premium = PREVIEW_STYLE_PRESETS.find((style) => style.id === "premium")!;
  const prompt = buildPreviewPrompt(options({ headline: "Новинка", features: ["warm"] }), premium);
  assert.match(prompt, /Headline text "Новинка" exactly as written/);
  assert.match(prompt, /Text layout: one short elegant headline/);
  assert.doesNotMatch(prompt, /benefit icons|snowflake/);
});

test("выбранный стиль из настроек", () => {
  assert.equal(options({ styleId: "catalog" }).styleId, "catalog");
  assert.equal(options().styleId, "");
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

test("цвета из карточки — кружками внахлёст в правом нижнем углу; модель держит угол свободным", async () => {
  assert.match(buildPreviewPrompt(options({ swatches: ["#7f1d1d"] })), /Keep the bottom-right corner free/);
  assert.doesNotMatch(buildPreviewPrompt(options({ swatches: ["красный", "javascript:"] })), /bottom-right corner/, "only real color codes count");
  assert.doesNotMatch(buildPreviewPrompt(options()), /bottom-right corner/);

  const white = await sharp({ create: { width: 400, height: 500, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const picture = await drawColorSwatches(white, ["#ff0000", "#0000ff"]);
  const { data, info } = await sharp(picture).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  // 400 px wide: circles of 30 px, 19 px apart, 18 px from the edges — centers at (348, 467) and (367, 467).
  const [red, blue, corner] = [pixel(346, 467), pixel(369, 467), pixel(10, 10)];
  assert.ok(red[0] > 200 && red[1] < 60 && red[2] < 60, `red: ${red}`);
  assert.ok(blue[2] > 200 && blue[0] < 60 && blue[1] < 60, `blue on top of red: ${blue}`);
  assert.deepEqual(corner, [255, 255, 255], "the rest of the picture is untouched");
});
