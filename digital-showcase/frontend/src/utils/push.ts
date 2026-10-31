import { api } from "../api/client";
import { isStandalone } from "../hooks/useInstallPrompt";

// Notifications on the owner's phone: the browser subscribes at its push
// service with the server's key, the server sends there whatever reaches the
// bell (backend pushService), public/sw.js shows it. The subscription stays
// in the browser when the owner signs out — only the server forgets the phone,
// and learns it again at the next sign-in (syncPush).

const WORKER_URL = "/sw.js";

export type PushSupport = "supported" | "needs-home-screen" | "unsupported";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** On an iPhone notifications work only in the cabinet added to the home screen (iOS 16.4+). */
export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  return isIos() && !isStandalone() ? "needs-home-screen" : "unsupported";
}

/** This browser's subscription, if notifications are on here. */
export async function currentSubscription() {
  if (pushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function madeWith(subscription: PushSubscription, key: Uint8Array) {
  const used = subscription.options.applicationServerKey;
  if (!used) return false;
  const bytes = new Uint8Array(used);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

/** A subscription with the server's current key: one made with an old key (a new server) is replaced. */
async function subscribed(registration: ServiceWorkerRegistration) {
  const { data } = await api.get<{ publicKey: string }>("/push");
  const key = keyBytes(data.publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && madeWith(existing, key)) return existing;
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * Turns notifications on here. Must be called right from a tap: the browser
 * asks the owner first. «off» — the owner closed the question.
 */
export async function enablePush(): Promise<"on" | "off" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  await navigator.serviceWorker.register(WORKER_URL);
  const subscription = await subscribed(await navigator.serviceWorker.ready);
  await api.post("/push/subscriptions", { ...subscription.toJSON(), welcome: true });
  return "on";
}

/** Turns them off here: the server forgets the phone, the browser drops the subscription. */
export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.delete("/push/subscriptions", { data: { endpoint: subscription.endpoint } }).catch(() => undefined);
  await subscription.unsubscribe();
}

/** Signing out: this phone stops getting the owner's notifications. */
export async function forgetPhone() {
  const subscription = await currentSubscription();
  if (subscription) await api.delete("/push/subscriptions", { data: { endpoint: subscription.endpoint } });
}

/** The cabinet opened with notifications on here: the server learns the phone is this owner's. */
export async function syncPush() {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration || !(await registration.pushManager.getSubscription())) return;
  const subscription = await subscribed(registration);
  await api.post("/push/subscriptions", subscription.toJSON());
}

/** «Проверить»: sent — on its way; gone — turn them on again; failed — the push service didn't take it. */
export async function testPush() {
  const subscription = await currentSubscription();
  if (!subscription) return "gone" as const;
  const { data } = await api.post<{ result: "sent" | "gone" | "failed" }>("/push/test", { endpoint: subscription.endpoint });
  return data.result;
}
