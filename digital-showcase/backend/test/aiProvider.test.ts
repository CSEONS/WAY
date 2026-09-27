import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

// A fake provider that records what it receives and answers in either format.
const received: { path: string; auth: string; body: Record<string, unknown> | string }[] = [];
let transcriptionStatus = 200;

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const isJson = (req.headers["content-type"] ?? "").includes("application/json");
    received.push({ path: req.url!, auth: String(req.headers.authorization), body: isJson ? JSON.parse(raw) : raw });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/chat/completions") {
      res.end(JSON.stringify({ choices: [{ message: { content: '{"title":"Платье"}' } }], usage: { prompt_tokens: 120, completion_tokens: 30 } }));
    } else if (req.url === "/v1/responses") {
      res.end(JSON.stringify({ output_text: '{"title":"Юбка"}', usage: { input_tokens: 200, output_tokens: 40 } }));
    } else if (req.url === "/v1/audio/transcriptions") {
      res.statusCode = transcriptionStatus;
      res.setHeader("Content-Type", "text/plain");
      res.end(transcriptionStatus === 200 ? "Синее платье, размер M" : "not found");
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: { message: "unknown model" } }));
    }
  });
});
server.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;

const { aiSummary, completeJson, isAiConfigured, transcribe } = await import("../src/services/aiProvider.js");
const { measureTokens } = await import("../src/services/aiUsageService.js");

function configure(values: Record<string, string | undefined>) {
  for (const name of ["AI_API_KEY", "OPENAI_API_KEY", "AI_BASE_URL", "OPENAI_BASE_URL", "AI_API_STYLE", "AI_MODEL", "AI_JSON_MODE", "AI_TRANSCRIBE_MODEL", "AI_TRANSCRIBE_BASE_URL"]) {
    delete process.env[name];
  }
  Object.assign(process.env, values);
}

test("Chat Completions: сообщение, картинки и токены", async () => {
  configure({ AI_API_KEY: "chat-key", AI_BASE_URL: base, AI_API_STYLE: "chat", AI_MODEL: "some/model" });
  received.length = 0;
  const { result, usage } = await measureTokens(() => completeJson({ instructions: "Отвечай JSON", text: "Синее платье", images: ["data:image/webp;base64,AAA"] }));
  assert.equal(result, '{"title":"Платье"}');
  assert.deepEqual(usage, { inputTokens: 120, outputTokens: 30 });

  const request = received[0];
  assert.equal(request.path, "/v1/chat/completions");
  assert.equal(request.auth, "Bearer chat-key");
  const body = request.body as { model: string; messages: { role: string; content: unknown }[]; response_format?: unknown };
  assert.equal(body.model, "some/model");
  assert.deepEqual(body.messages[0], { role: "system", content: "Отвечай JSON" });
  assert.deepEqual(body.messages[1].content, [
    { type: "text", text: "Синее платье" },
    { type: "image_url", image_url: { url: "data:image/webp;base64,AAA", detail: "low" } }
  ]);
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("без картинок сообщение — просто текст; AI_JSON_MODE=off убирает response_format", async () => {
  configure({ AI_API_KEY: "chat-key", AI_BASE_URL: base, AI_API_STYLE: "chat", AI_JSON_MODE: "off" });
  received.length = 0;
  await completeJson({ instructions: "x", text: "только текст" });
  const body = received[0].body as { messages: { content: unknown }[]; response_format?: unknown };
  assert.equal(body.messages[1].content, "только текст");
  assert.equal(body.response_format, undefined);
});

test("Responses API по умолчанию и старые переменные OPENAI_* работают", async () => {
  configure({ OPENAI_API_KEY: "old-key", OPENAI_BASE_URL: base });
  received.length = 0;
  const { result, usage } = await measureTokens(() => completeJson({ instructions: "x", text: "юбка" }));
  assert.equal(result, '{"title":"Юбка"}');
  assert.deepEqual(usage, { inputTokens: 200, outputTokens: 40 });
  assert.equal(received[0].path, "/v1/responses");
  assert.equal(received[0].auth, "Bearer old-key");
});

test("ключ-заглушка из .env.example считается ненастроенным", () => {
  configure({ OPENAI_API_KEY: "API_KEY" });
  assert.equal(isAiConfigured(), false);
  assert.equal(aiSummary().configured, false);
});

test("ошибка провайдера — понятное сообщение 502", async () => {
  configure({ AI_API_KEY: "k", AI_BASE_URL: `${base}/broken` });
  await assert.rejects(completeJson({ instructions: "x", text: "y" }), (error: { status?: number; message?: string }) => {
    return error.status === 502 && error.message === "AI-провайдер вернул ошибку: unknown model";
  });
});

test("голос: распознаётся, отключается, а без поддержки у провайдера — подсказка", async () => {
  const audio = { buffer: Buffer.from("audio"), mimetype: "audio/webm", filename: "voice.webm" };
  configure({ AI_API_KEY: "k", AI_BASE_URL: base });
  transcriptionStatus = 200;
  assert.equal(await transcribe(audio, "подсказка"), "Синее платье, размер M");

  transcriptionStatus = 404;
  await assert.rejects(transcribe(audio, ""), /не распознаёт голос/);

  configure({ AI_API_KEY: "k", AI_BASE_URL: base, AI_TRANSCRIBE_MODEL: "off" });
  await assert.rejects(transcribe(audio, ""), /Голосовой ввод отключён/);
});

test("сводка для админки без ключа", () => {
  configure({ AI_API_KEY: "secret-key", AI_BASE_URL: "https://llm.example.net/v1", AI_API_STYLE: "chat", AI_MODEL: "m1" });
  const summary = aiSummary();
  assert.deepEqual(summary, { configured: true, host: "llm.example.net", model: "m1", style: "chat", voice: "llm.example.net · gpt-4o-mini-transcribe" });
  assert.ok(!JSON.stringify(summary).includes("secret-key"));
});

test.after(() => server.close());
