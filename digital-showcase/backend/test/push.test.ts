import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import jwt from "jsonwebtoken";

// A throwaway database: must be set before the db module is loaded.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-push-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "admin-test-password";
process.env.JWT_SECRET = "push-test-secret-push-test-secret-0123";
process.env.PUBLIC_ORIGIN = "https://vitriny.example";
process.env.TELEGRAM_BOT_TOKEN = "";

const { closeDb, getDb, initDatabase } = await import("../src/database/db.js");
const { app } = await import("../src/app.js");
const { createOwner } = await import("../src/services/userService.js");
const { createStore } = await import("../src/services/storeService.js");
const { isDaytime, notifyStoreOwner, notifyUser } = await import("../src/services/notificationService.js");
const push = await import("../src/services/pushService.js");
// What the browser does with a push: web-push's own decryption library.
const ece = createRequire(import.meta.url)("http_ece") as { decrypt(body: Buffer, params: Record<string, unknown>): Buffer };

await initDatabase();
const db = await getDb();
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const admin = (await db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN'"))!;
const owner = (await createOwner({ name: "Владелец", phone: "+79280000041", password: "secret123" }))!;
const other = (await createOwner({ name: "Другой", phone: "+79280000042", password: "secret123" }))!;
const store = (await createStore({ ownerId: owner.id, name: "Мой магазин", slug: "push-shop" }))!;

/** A phone's browser: its push address and keys, and what it can decrypt. */
function phone(host = "fcm.googleapis.com") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16).toString("base64url");
  const subscription = { endpoint: `https://${host}/fcm/send/${randomBytes(8).toString("hex")}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth } };
  const read = (body: Buffer) => JSON.parse(ece.decrypt(body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8"));
  return { subscription, read };
}

// Push services: answered here; calls to the test server go through.
const realFetch = globalThis.fetch;
let sent: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
let answer: (url: string) => number = () => 201;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith(base)) return realFetch(input, init);
  sent.push({ url, headers: init!.headers as Record<string, string>, body: Buffer.from(init!.body as Uint8Array) });
  return new Response(null, { status: answer(url) });
}) as typeof fetch;

async function delivered() {
  await push.pushesSent();
  const result = sent;
  sent = [];
  return result;
}

const sign = (payload: object) => jwt.sign(payload, process.env.JWT_SECRET!);
const ownerToken = sign({ userId: owner.id, role: "OWNER" });

async function call(method: string, url: string, token: string, body?: unknown) {
  const response = await fetch(base + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

const devices = (userId: string) => db.all<{ endpoint: string }>("SELECT endpoint FROM push_subscriptions WHERE userId = ?", userId);

test("ключи сервера создаются один раз и хранятся в базе", async () => {
  const response = await call("GET", "/api/push", ownerToken);
  assert.equal(response.status, 200);
  assert.match(response.data.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(push.pushPublicKey(), response.data.publicKey);
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'pushKeys'");
  assert.equal(JSON.parse(row!.value).publicKey, response.data.publicKey);
});

test("адрес — только push-сервис в интернете", () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QH8", "https://updates.push.services.mozilla.com/wpush/v2/x"]) {
    assert.ok(push.isPushEndpoint(ok), ok);
  }
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://0x7f.0.0.1/x",
    "https://[::1]/x",
    "https://backend:4000/api",
    "https://backend/api",
    "https://printer.local/x",
    "https://fcm.googleapis.com:8443/x",
    "not a url"
  ]) {
    assert.equal(push.isPushEndpoint(bad), false, bad);
  }
});

test("включение: «Уведомления включены» на этот телефон, при новом входе — без сообщения, выключение", async () => {
  const device = phone();
  let response = await call("POST", "/api/push/subscriptions", ownerToken, { ...device.subscription, welcome: true });
  assert.equal(response.status, 200);
  assert.equal(response.data.isNew, true);
  let [message, ...rest] = await delivered();
  assert.equal(rest.length, 0);
  assert.equal(message.url, device.subscription.endpoint);
  assert.deepEqual(device.read(message.body), {
    title: "Уведомления включены",
    body: "Сюда будут приходить напоминания об оплате, итоги месяца, результаты проверки фото и сообщения администратора.",
    link: "/dashboard"
  });

  // Signed in again on the same phone: it tells the server, nothing is sent.
  response = await call("POST", "/api/push/subscriptions", ownerToken, device.subscription);
  assert.equal(response.data.isNew, false);
  assert.equal((await delivered()).length, 0);

  response = await call("POST", "/api/push/test", ownerToken, { endpoint: device.subscription.endpoint });
  assert.equal(response.data.result, "sent");
  [message] = await delivered();
  assert.equal(device.read(message.body).title, "Уведомления включены");

  response = await call("DELETE", "/api/push/subscriptions", ownerToken, { endpoint: device.subscription.endpoint });
  assert.equal(response.status, 204);
  assert.equal((await devices(owner.id)).length, 0);
  response = await call("POST", "/api/push/test", ownerToken, { endpoint: device.subscription.endpoint });
  assert.equal(response.data.result, "gone");
});

test("нельзя: адрес внутри сервера, вход админа от имени владельца, админ", async () => {
  const device = phone();
  let response = await call("POST", "/api/push/subscriptions", ownerToken, { ...device.subscription, endpoint: "https://backend:4000/api/admin" });
  assert.equal(response.status, 400);
  response = await call("POST", "/api/push/subscriptions", sign({ userId: owner.id, role: "OWNER", impersonatedBy: admin.id }), device.subscription);
  assert.equal(response.status, 403);
  response = await call("POST", "/api/push/subscriptions", sign({ userId: admin.id, role: "ADMIN" }), device.subscription);
  assert.equal(response.status, 403);
  assert.equal((await db.get<{ count: number }>("SELECT COUNT(*) as count FROM push_subscriptions"))!.count, 0);
  assert.equal((await delivered()).length, 0);
});

test("уведомление из колокольчика — на все телефоны владельца, с темой и сроком", async () => {
  const phoneA = phone();
  const phoneB = phone("web.push.apple.com");
  const otherPhone = phone();
  await push.subscribe(owner.id, phoneA.subscription);
  await push.subscribe(owner.id, phoneB.subscription);
  await push.subscribe(other.id, otherPhone.subscription);
  await delivered();

  await notifyStoreOwner(store.id, {
    source: "SYSTEM",
    title: "Подписка заканчивается 8 ноября",
    body: "«Мой магазин»: осталось 6 дней.",
    link: `/dashboard/stores/${store.id}/subscription`,
    topic: `subscription:${store.id}`
  });
  const messages = await delivered();
  assert.deepEqual(messages.map((message) => message.url).sort(), [phoneA.subscription.endpoint, phoneB.subscription.endpoint].sort());
  const toA = messages.find((message) => message.url === phoneA.subscription.endpoint)!;
  assert.deepEqual(phoneA.read(toA.body), {
    title: "Подписка заканчивается 8 ноября",
    body: "«Мой магазин»: осталось 6 дней.",
    link: `/dashboard/stores/${store.id}/subscription`,
    tag: `subscription:${store.id}`
  });
  assert.equal(toA.headers.TTL, String(3 * 24 * 60 * 60));
  assert.equal(toA.headers.Topic, push.pushTopic(`subscription:${store.id}`));
  assert.match(toA.headers.Topic, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(toA.headers["Content-Encoding"], "aes128gcm");
  assert.match(toA.headers.Authorization, /^vapid t=[^,]+, k=/);
  const claims = JSON.parse(Buffer.from(toA.headers.Authorization.slice(8).split(",")[0].split(".")[1], "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.sub, "https://vitriny.example");

  // Signed in on the other owner's phone: it now gets this owner's, and not the other's.
  assert.deepEqual(await push.subscribe(owner.id, otherPhone.subscription), { isNew: true });
  assert.equal((await delivered()).length, 0);
  await notifyUser({ userId: other.id, source: "ADMIN", title: "Лично", body: "Привет" });
  assert.equal((await delivered()).length, 0);
  await db.run("DELETE FROM push_subscriptions");
});

test("телефон отписался (410) — забываем его, сбой push-сервиса — нет", async () => {
  const gone = phone();
  const flaky = phone();
  await push.subscribe(owner.id, gone.subscription);
  await push.subscribe(owner.id, flaky.subscription);
  await delivered();

  answer = (url) => (url === gone.subscription.endpoint ? 410 : 500);
  await notifyUser({ userId: owner.id, source: "SYSTEM", title: "Итоги за октябрь", body: "…" });
  assert.equal((await delivered()).length, 2);
  assert.deepEqual(
    (await devices(owner.id)).map((device) => device.endpoint),
    [flaky.subscription.endpoint]
  );
  const response = await call("POST", "/api/push/test", ownerToken, { endpoint: flaky.subscription.endpoint });
  assert.equal(response.data.result, "failed");
  answer = () => 201;
  await delivered();
  await db.run("DELETE FROM push_subscriptions");
});

test("длинный текст обрезается, без ссылки — кабинет", () => {
  const payload = JSON.parse(push.pushPayload({ title: "Сообщение", body: "а".repeat(1500) }));
  assert.equal(payload.body.length, 1000);
  assert.ok(payload.body.endsWith("…"));
  assert.equal(payload.link, "/dashboard");
  assert.equal(payload.tag, undefined);
});

test("напоминания и итоги месяца ждут дня: 9:00–21:00", () => {
  const at = (hour: number, minute = 0) => new Date(2026, 10, 2, hour, minute);
  assert.equal(isDaytime(at(3)), false);
  assert.equal(isDaytime(at(8, 59)), false);
  assert.equal(isDaytime(at(9)), true);
  assert.equal(isDaytime(at(20, 59)), true);
  assert.equal(isDaytime(at(21)), false);
});

test.after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
