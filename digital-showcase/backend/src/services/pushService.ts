import { createHash } from "node:crypto";
import webpush from "web-push";
import { getDb, rawDb } from "../database/db.js";
import { HttpError } from "../utils/http.js";

// Notifications on the owner's phone. Everything that reaches the bell
// (notificationService) also goes to every phone — every browser — the owner
// turned them on for. Web Push: the browser gives an address at its push
// service (Google, Apple, Mozilla, Microsoft) and keys; the server sends the
// message there encrypted, signed with its own VAPID keys. Those are made on
// first use and kept in `settings`, so there is nothing to set up. The phone
// shows the message with frontend/public/sw.js. On an iPhone it works only in
// the cabinet added to the home screen (iOS 16.4+).

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushMessage {
  title: string;
  body: string;
  /** In-app address the notification opens. */
  link?: string | null;
  /** As in the bell: a newer one on the same topic replaces the older on the phone too. */
  topic?: string | null;
}

type Device = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushResult = "sent" | "gone" | "failed";

const KEYS_SETTING = "pushKeys";
/** A phone off longer than this gets the bell, not a pile of old messages. */
const TTL_SECONDS = 3 * 24 * 60 * 60;
/** Old phones nobody turned off: only the latest few are kept. */
const MAX_DEVICES = 10;
const MAX_BODY = 1000;

const WELCOME: PushMessage = {
  title: "Уведомления включены",
  body: "Сюда будут приходить напоминания об оплате, итоги месяца, результаты проверки фото и сообщения администратора.",
  link: "/dashboard"
};

/** The server's VAPID keys: made once, kept in settings. */
function vapidKeys(): { publicKey: string; privateKey: string } {
  const db = rawDb();
  const read = () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEYS_SETTING) as { value: string } | undefined;
    try {
      const value = row && JSON.parse(row.value);
      return value?.publicKey && value?.privateKey ? (value as { publicKey: string; privateKey: string }) : null;
    } catch {
      return null;
    }
  };
  const saved = read();
  if (saved) return saved;
  db.prepare(
    "INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt"
  ).run(KEYS_SETTING, JSON.stringify(webpush.generateVAPIDKeys()), new Date().toISOString());
  return read()!;
}

/** What the browser subscribes with. */
export function pushPublicKey() {
  return vapidKeys().publicKey;
}

/** Who runs the server, for push services that need to reach them: the site, or the admin's email. */
function contact() {
  const origin = (process.env.PUBLIC_ORIGIN || "").trim().replace(/\/+$/, "");
  if (origin.startsWith("https://")) return origin;
  return `mailto:${process.env.ADMIN_EMAIL?.trim() || "admin@localhost"}`;
}

/**
 * A push service's address: https on a public name, not an IP or a name
 * inside the server's network — a made-up address must not make the server
 * call its neighbours.
 */
export function isPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  return !/\.(local|localhost|internal|lan|home)$/.test(host);
}

/** What the phone shows; read by the service worker. */
export function pushPayload(message: PushMessage) {
  return JSON.stringify({
    title: message.title,
    body: message.body.length > MAX_BODY ? `${message.body.slice(0, MAX_BODY - 1)}…` : message.body,
    link: message.link || "/dashboard",
    tag: message.topic || undefined
  });
}

/** The Topic header: up to 32 URL-safe characters, so the push service keeps only the newest undelivered one. */
export function pushTopic(topic: string) {
  return createHash("sha256").update(topic).digest("base64url").slice(0, 32);
}

const sending = new Set<Promise<unknown>>();

function track<T>(job: Promise<T>) {
  sending.add(job);
  void job.finally(() => sending.delete(job));
  return job;
}

/** Waits for the pushes on their way. */
export async function pushesSent() {
  while (sending.size) await Promise.all(sending);
}

async function sendTo(device: Device, message: PushMessage): Promise<PushResult> {
  const db = await getDb();
  const { publicKey, privateKey } = vapidKeys();
  let request: webpush.RequestDetails;
  try {
    request = webpush.generateRequestDetails({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, pushPayload(message), {
      vapidDetails: { subject: contact(), publicKey, privateKey },
      TTL: TTL_SECONDS,
      topic: message.topic ? pushTopic(message.topic) : undefined
    });
  } catch {
    // The browser's keys can't be used: nothing will ever reach that phone.
    await db.run("DELETE FROM push_subscriptions WHERE id = ?", device.id);
    return "gone";
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers as Record<string, unknown>)) {
    if (name.toLowerCase() !== "content-length") headers[name] = String(value);
  }
  try {
    const response = await fetch(request.endpoint, {
      method: "POST",
      headers,
      body: request.body ? new Uint8Array(request.body) : undefined,
      signal: AbortSignal.timeout(10_000)
    });
    if (response.ok) return "sent";
    // Turned off in the browser, the app removed, or expired.
    if (response.status === 404 || response.status === 410) {
      await db.run("DELETE FROM push_subscriptions WHERE id = ?", device.id);
      return "gone";
    }
    console.warn(`Push to ${new URL(device.endpoint).host} failed: ${response.status} ${(await response.text().catch(() => "")).slice(0, 200)}`);
  } catch (error) {
    console.warn(`Push to ${new URL(device.endpoint).host} failed: ${error instanceof Error ? error.message : error}`);
  }
  return "failed";
}

/** To every phone the user turned notifications on for. Never fails: the bell has the notification anyway. Returns how many took it. */
export function pushToUser(userId: string, message: PushMessage) {
  return track(
    (async () => {
      const db = await getDb();
      const devices = await db.all<Device>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ?", userId);
      const results = await Promise.all(devices.map((device) => sendTo(device, message)));
      return results.filter((result) => result === "sent").length;
    })().catch((error) => {
      console.warn("Push failed", error);
      return 0;
    })
  );
}

/**
 * Turns notifications on for a phone, or tells the server again at sign-in
 * that the phone is this user's: one that was someone else's moves to this
 * user. Just turned on (`welcome`) — «Уведомления включены» right away.
 */
export async function subscribe(userId: string, input: PushSubscriptionInput, { welcome = false } = {}) {
  if (!isPushEndpoint(input.endpoint)) throw new HttpError(400, "Браузер дал неподходящий адрес для уведомлений");
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await db.get<{ id: string; userId: string }>("SELECT id, userId FROM push_subscriptions WHERE endpoint = ?", input.endpoint);
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.run("UPDATE push_subscriptions SET userId = ?, p256dh = ?, auth = ?, updatedAt = ? WHERE id = ?", userId, input.keys.p256dh, input.keys.auth, now, id);
  } else {
    await db.run(
      "INSERT INTO push_subscriptions (id, userId, endpoint, p256dh, auth, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      userId,
      input.endpoint,
      input.keys.p256dh,
      input.keys.auth,
      now,
      now
    );
  }
  await db.run(
    "DELETE FROM push_subscriptions WHERE userId = ? AND id NOT IN (SELECT id FROM push_subscriptions WHERE userId = ? ORDER BY updatedAt DESC LIMIT ?)",
    userId,
    userId,
    MAX_DEVICES
  );
  if (welcome) void track(sendTo({ id, endpoint: input.endpoint, ...input.keys }, WELCOME));
  return { isNew: existing?.userId !== userId };
}

/** Turned off on the phone, or signed out on it. */
export async function unsubscribe(userId: string, endpoint: string) {
  const db = await getDb();
  await db.run("DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?", userId, endpoint);
}

/** «Проверить»: «Уведомления включены» once more, to this phone only. */
export async function sendTest(userId: string, endpoint: string) {
  const db = await getDb();
  const device = await db.get<Device>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE userId = ? AND endpoint = ?", userId, endpoint);
  if (!device) return "gone" as const;
  return sendTo(device, WELCOME);
}
