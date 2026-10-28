import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import sharp from "sharp";

// «Заполнить карточку с ИИ»: only photos go to the model, with an instruction
// to fill everything visible and not to guess the price.
let lastBody: { messages: { role: string; content: unknown }[] } | null = null;

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ title: "Пуховик синий", description: "Тёплый стёганый пуховик", category: "Верхняя одежда", price: null, sizes: [], colors: [{ name: "синий", hex: "#1B2F6B" }] }) } }]
      })
    );
  });
});
server.listen(0);
Object.assign(process.env, {
  AI_API_KEY: "test-key",
  AI_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
  AI_API_STYLE: "chat",
  AI_MODEL: "test-model"
});

const { createProductAiDraft } = await import("../src/services/aiDraftService.js");

test("черновик только по фото: в ИИ уходят фото и просьба заполнить по ним, цену не придумывать", async () => {
  const buffer = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#1b2f6b" } }).png().toBuffer();
  const draft = await createProductAiDraft({ prompt: "", images: [{ buffer, mimetype: "image/png", originalname: "jacket.png", size: buffer.length }] });

  assert.equal(draft.title, "Пуховик синий");
  assert.equal(draft.category, "Верхняя одежда");
  assert.equal(draft.price, null);
  assert.equal(draft.priceText, "Уточнить у продавца");
  assert.deepEqual(draft.colors, [{ name: "синий", hex: "#1b2f6b" }]);
  assert.ok(draft.variants.every((variant) => variant.colorHex === "#1b2f6b"), "variants built from colors keep the AI's code");

  const content = lastBody!.messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
  assert.match(content[0].text ?? "", /заполни карточку только по фотографиям/);
  assert.match(content[0].text ?? "", /Цену не придумывай/);
  assert.equal(content.filter((part) => part.type === "image_url").length, 1);
  assert.match(content[1].image_url?.url ?? "", /^data:image\/webp;base64,/);
});

test("одно поле («Вручную + ИИ»): в ИИ уходит задача только на это поле и то, что владелец уже написал", async () => {
  const draft = await createProductAiDraft({ field: "description", known: { title: "Пуховик синий", description: "старое", category: "  " } });

  assert.equal(draft.description, "Тёплый стёганый пуховик");
  const content = lastBody!.messages[1].content;
  const text = typeof content === "string" ? content : ((content as { type: string; text?: string }[])[0].text ?? "");
  assert.match(text, /просит помочь с одним полем/);
  assert.match(text, /только описание для покупателя/);
  assert.match(text, /Фото нет: опирайся на то, что владелец уже написал/);
  assert.match(text, /Название: Пуховик синий/);
  assert.doesNotMatch(text, /Описание: старое/, "the field being redone isn't sent back as a hint");
  assert.doesNotMatch(text, /Категория:/, "empty fields aren't sent");
});

test.after(() => server.close());
