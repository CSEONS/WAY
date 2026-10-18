import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// «Оставить заявку» over real HTTP against a throwaway database.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-leads-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "admin-test-password";
process.env.JWT_SECRET = "leads-test-secret-leads-test-secret-01";
process.env.TELEGRAM_BOT_TOKEN = "";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { app } = await import("../src/app.js");
const { LEAD_LIMITS, listLeads, overIpLimit, tooManyLeads } = await import("../src/services/leadService.js");

await initDatabase();
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const person = { name: "Аминат", phone: "+7 928 123-45-67", comment: "Звоните после 12", consent: true, filledMs: 15_000 };

async function send(body: Record<string, unknown>) {
  const response = await fetch(`${base}/api/public/leads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as { ok?: boolean; repeat?: boolean; message?: string } };
}

test("боты: ловушка и слишком быстрая форма — «отправлено», но ничего не сохранено", async () => {
  assert.equal((await send({ ...person, website: "https://spam.example" })).status, 201);
  assert.equal((await send({ ...person, filledMs: 400 })).status, 201);
  // A script posting without the form at all.
  const { status, body } = await send({ name: "Бот", phone: "+79280000000", consent: true });
  assert.equal(status, 400);
  assert.match(body.message!, /Обновите страницу/);
  assert.deepEqual(await listLeads(), []);
});

test("достаточно имени и телефона; повтор с тем же номером не создаёт вторую заявку", async () => {
  assert.equal((await send({ ...person, phone: "123" })).status, 400);

  const first = await send({ name: person.name, phone: person.phone, consent: true, filledMs: 9000 });
  assert.equal(first.status, 201);
  const [lead] = await listLeads();
  assert.deepEqual([lead.name, lead.storeName, lead.city, lead.comment], ["Аминат", null, null, null]);

  // Written differently, same number: the person already waits for a call.
  const again = await send({ ...person, phone: "8 (928) 123 45 67" });
  assert.deepEqual([again.status, again.body.repeat], [200, true]);
  assert.equal((await listLeads()).length, 1);
});

test("с одного адреса — не больше трёх попыток в час", async () => {
  // Two attempts above already counted; one more is let in, the next is stopped.
  assert.equal((await send({ ...person, phone: "+79280000002" })).status, 201);
  const stopped = await send({ ...person, phone: "+79280000003" });
  assert.equal(stopped.status, 429);
  assert.match(stopped.body.message!, /уже отправили несколько заявок/);
  assert.equal((await listLeads()).length, 2);
});

test("лимиты адреса: час и сутки; общий потолок заявок в час", async () => {
  const start = Date.parse("2026-01-10T09:00:00Z");
  for (let index = 0; index < LEAD_LIMITS.perIpPerHour; index++) assert.equal(overIpLimit("10.0.0.1", start + index), false);
  assert.equal(overIpLimit("10.0.0.1", start + 10), true);
  // An hour later the address may again — until the day's limit.
  let time = start + 61 * 60 * 1000;
  let allowed = LEAD_LIMITS.perIpPerHour;
  while (!overIpLimit("10.0.0.1", time)) {
    allowed++;
    time += 21 * 60 * 1000;
  }
  assert.equal(allowed, LEAD_LIMITS.perIpPerDay);
  assert.equal(overIpLimit("10.0.0.2", time), false);

  const db = await getDb();
  const now = new Date();
  for (let index = 0; index < LEAD_LIMITS.totalPerHour; index++) {
    await db.run("INSERT INTO leads (id, name, phone, status, createdAt) VALUES (?, 'Флуд', ?, 'NEW', ?)", `flood-${index}`, `+7928555${String(index).padStart(4, "0")}`, now.toISOString());
  }
  assert.equal(await tooManyLeads(now), true);
  assert.equal(await tooManyLeads(new Date(now.getTime() + 61 * 60 * 1000)), false);
});

test.after(() => {
  server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
