import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// «Траты по дням»: what OpenAI billed (Usage and Costs API, Admin key), or the site's own records without it.

const DAY = 86400;
const asked: URL[] = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  asked.push(url);
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Bearer admin-key") {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: { message: "Incorrect API key provided" } }));
    return;
  }
  const start = Number(url.searchParams.get("start_time"));
  const end = Number(url.searchParams.get("end_time"));
  const limit = Number(url.searchParams.get("limit"));
  const from = Number(url.searchParams.get("page") ?? 0);
  const times: number[] = [];
  for (let time = start; time < end; time += DAY) times.push(time);
  const result =
    url.pathname === "/v1/organization/costs"
      ? () => [
          { object: "organization.costs.result", amount: { value: 0.25, currency: "usd" } },
          { object: "organization.costs.result", amount: { value: "0.25", currency: "usd" } }
        ]
      : () => [{ object: "organization.usage.completions.result", input_tokens: 1000, output_tokens: 100, num_model_requests: 3 }];
  const page = times.slice(from, from + limit).map((time) => ({ object: "bucket", start_time: time, end_time: time + DAY, results: result() }));
  const next = from + limit < times.length ? String(from + limit) : null;
  res.end(JSON.stringify({ object: "page", data: page, has_more: Boolean(next), next_page: next }));
});
server.listen(0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-ai-days-test-"));
Object.assign(process.env, {
  DATABASE_URL: `file:${path.join(dir, "test.sqlite")}`,
  UPLOAD_DIR: path.join(dir, "uploads"),
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD: "test-password",
  JWT_SECRET: "test-secret-test-secret-test-secret",
  AI_RUB_PER_USD: "100",
  OPENAI_ADMIN_KEY: "admin-key",
  OPENAI_ADMIN_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
});

const { closeDb, initDatabase } = await import("../src/database/db.js");
const { createStore } = await import("../src/services/storeService.js");
const { createOwner } = await import("../src/services/userService.js");
const { recordUsage, spendByDay } = await import("../src/services/aiUsageService.js");

await initDatabase();
const owner = (await createOwner({ name: "Владелец", phone: "+79280000031", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "ИИ по дням", slug: "ai-days" }))!;
const current = { text: "gpt-5.6-luna", preview: "gpt-image-2.5-flare" };
// $0.0015 on Luna: 0.15 ₽ at 100 ₽ for $1.
await recordUsage(store.id, "DRAFT", 1, { inputTokens: 1500, outputTokens: 1000, model: "gpt-5.6-luna" });

test("с Admin-ключом: доллары и токены из OpenAI по дням UTC, рубли по курсу", async () => {
  const now = new Date("2026-11-09T15:00:00Z");
  const report = await spendByDay(current, 7, { refresh: true, now });

  assert.equal(report.source, "openai");
  assert.equal(report.error, null);
  assert.deepEqual(report.days.map((day) => day.date), ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]);
  assert.deepEqual(report.days[0], { date: "2026-11-03", inputTokens: 1000, outputTokens: 100, requests: 3, usd: 0.5, rub: 50 });
  assert.deepEqual(report.total, { inputTokens: 7000, outputTokens: 700, requests: 21, usd: 3.5, rub: 350 });

  const costs = asked.find((url) => url.pathname === "/v1/organization/costs")!;
  assert.equal(costs.searchParams.get("start_time"), String(Date.parse("2026-11-03T00:00:00Z") / 1000), "starts at a UTC midnight");
  assert.equal(costs.searchParams.get("bucket_width"), "1d");
});

test("90 дней: страницы OpenAI собираются целиком, лимит на страницу — как у API", async () => {
  asked.length = 0;
  const report = await spendByDay(current, 90, { refresh: true, now: new Date("2026-11-09T15:00:00Z") });

  assert.equal(report.days.length, 90);
  assert.equal(report.total.requests, 270);
  const usagePages = asked.filter((url) => url.pathname === "/v1/organization/usage/completions");
  assert.equal(usagePages.length, 3, "31 days a page at most");
  assert.ok(usagePages.every((url) => Number(url.searchParams.get("limit")) <= 31));
  assert.equal(asked.filter((url) => url.pathname === "/v1/organization/costs").length, 1);
});

test("неверный ключ: понятная ошибка и оценка по записям сайта", async () => {
  process.env.OPENAI_ADMIN_KEY = "wrong-key";
  const report = await spendByDay(current, 7, { refresh: true });

  assert.equal(report.source, "site");
  assert.match(report.error ?? "", /OPENAI_ADMIN_KEY/);
  assert.deepEqual(report.total, { inputTokens: 1500, outputTokens: 1000, requests: 1, usd: 0.0015, rub: 0.15 });
  assert.equal(report.days.at(-1)?.requests, 1, "today is the last day");
});

test("без ключа: записи сайта, без ошибки", async () => {
  delete process.env.OPENAI_ADMIN_KEY;
  const report = await spendByDay(current, 30);

  assert.equal(report.source, "site");
  assert.equal(report.adminKey, false);
  assert.equal(report.error, null);
  assert.equal(report.days.length, 30);
});

test.after(() => {
  server.close();
  closeDb();
});
