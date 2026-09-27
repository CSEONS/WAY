import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// The whole API over real HTTP against a throwaway database.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-http-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
process.env.UPLOAD_DIR = path.join(dir, "uploads");
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "admin-test-password";
process.env.JWT_SECRET = "http-test-secret-http-test-secret-0123";
process.env.TELEGRAM_BOT_TOKEN = "";

const { closeDb, initDatabase } = await import("../src/database/db.js");
const { app } = await import("../src/app.js");
const { createOwner } = await import("../src/services/userService.js");
const { createStore } = await import("../src/services/storeService.js");
const { createProduct } = await import("../src/services/productService.js");

await initDatabase();
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const DAY = 24 * 60 * 60 * 1000;

const ownerA = (await createOwner({ name: "Владелец А", phone: "+79280000011", password: "password-a" }))!;
const ownerB = (await createOwner({ name: "Владелец Б", phone: "+79280000022", password: "password-b" }))!;
const storeA = (await createStore({ ownerId: ownerA.id, name: "Магазин А", slug: "shop-a" }))!;
const storeB = (await createStore({ ownerId: ownerB.id, name: "Магазин Б", slug: "shop-b" }))!;
const productB = (await createProduct({ storeId: storeB.id, title: "Платье Б" }))!;

async function call(method: string, url: string, { token, body, raw }: { token?: string; body?: unknown; raw?: string } = {}) {
  const response = await fetch(base + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined || raw ? { "Content-Type": "application/json" } : {}) },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
}

async function login(loginValue: string, password: string) {
  const response = await call("POST", "/api/auth/login", { body: { login: loginValue, password } });
  assert.equal(response.status, 200);
  return response.data.token as string;
}

test("health: база отвечает", async () => {
  const response = await call("GET", "/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.data.database, "ok");
});

test("заголовки безопасности на месте, Express не представляется", async () => {
  const response = await call("GET", "/api/health");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("владелец А не видит и не меняет магазин Б", async () => {
  const token = await login("+7 928 000-00-11", "password-a");
  assert.equal((await call("GET", `/api/owner/stores/${storeA.id}`, { token })).status, 200);
  assert.equal((await call("GET", `/api/owner/stores/${storeB.id}`, { token })).status, 404);
  assert.equal((await call("GET", `/api/owner/stores/${storeB.id}/products`, { token })).status, 404);
  assert.equal((await call("PATCH", `/api/owner/stores/${storeB.id}/products/${productB.id}`, { token, body: { title: "Взлом" } })).status, 404);
  assert.equal((await call("DELETE", `/api/owner/stores/${storeB.id}/products/${productB.id}`, { token })).status, 404);
  // Store A's route with store B's product id: also not found.
  assert.equal((await call("PATCH", `/api/owner/stores/${storeA.id}/products/${productB.id}`, { token, body: { title: "Взлом" } })).status, 404);
  const ownList = await call("GET", "/api/owner/stores", { token });
  assert.deepEqual(ownList.data.map((store: { id: string }) => store.id), [storeA.id]);
});

test("владелец не попадает в админку", async () => {
  const token = await login("+79280000011", "password-a");
  assert.equal((await call("GET", "/api/admin/stores", { token })).status, 403);
  assert.equal((await call("GET", "/api/admin/stores")).status, 401);
});

test("витрина: работает в отсрочку и закрыта после неё", async () => {
  const store = (await createStore({ ownerId: ownerA.id, name: "Отсрочка", slug: "grace-shop", subscriptionEndsAt: new Date(Date.now() - DAY).toISOString() }))!;
  assert.equal((await call("GET", `/api/public/stores/${store.slug}`)).status, 200);
  const expired = (await createStore({ ownerId: ownerA.id, name: "Просрочен", slug: "expired-shop", subscriptionEndsAt: new Date(Date.now() - 5 * DAY).toISOString() }))!;
  const response = await call("GET", `/api/public/stores/${expired.slug}`);
  assert.equal(response.status, 403);
  assert.equal((await call("GET", `/api/public/stores/${expired.slug}/products`)).status, 403);
});

test("неверные данные — понятная ошибка 400, а не 500", async () => {
  const token = await login("+79280000011", "password-a");
  const noTitle = await call("POST", `/api/owner/stores/${storeA.id}/products`, { token, body: { title: " " } });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.data.message, "Поле «Название»: не заполнено");

  const badStatus = await call("POST", `/api/owner/stores/${storeA.id}/products`, { token, body: { title: "Юбка", status: "SOLD" } });
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.data.message, "Поле «Наличие»: недопустимое значение");

  const badPrice = await call("PATCH", `/api/owner/stores/${storeA.id}/products/${(await createProduct({ storeId: storeA.id, title: "Шарф" }))!.id}`, {
    token,
    body: { price: "дорого" }
  });
  assert.equal(badPrice.status, 400);
  assert.equal(badPrice.data.message, "Поле «Цена»: неверный формат");

  const brokenJson = await call("POST", "/api/auth/login", { raw: "{not json" });
  assert.equal(brokenJson.status, 400);

  const priceAsText = await call("POST", `/api/owner/stores/${storeA.id}/products`, {
    token,
    body: {
      title: "Кофта",
      price: "1 500",
      isVisible: true,
      sizes: ["M", ""],
      colors: [
        { name: "Синий", hex: "" },
        { name: "Красный", hex: "красный" },
        { name: "", hex: null }
      ]
    }
  });
  assert.equal(priceAsText.status, 201);
  assert.equal(priceAsText.data.price, 1500);
  assert.equal(priceAsText.data.isVisible, 1);
  assert.deepEqual(priceAsText.data.sizes.map((size: { value: string }) => size.value), ["M"]);
  assert.deepEqual(priceAsText.data.colors.map((color: { name: string; hex: string | null }) => [color.name, color.hex]), [["Красный", null], ["Синий", null]]);
});

test("после 10 неверных паролей вход блокируется на 15 минут", async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await call("POST", "/api/auth/login", { body: { login: "+79280000022", password: "wrong" } })).status, 401);
  }
  const blocked = await call("POST", "/api/auth/login", { body: { login: "+79280000022", password: "password-b" } });
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.message, /Слишком много попыток/);
});

test.after(() => {
  server.close();
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});
