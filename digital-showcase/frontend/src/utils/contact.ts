import type { Store } from "../types/models";

export type ContactChannel = "whatsapp" | "telegram" | "instagram" | "vk" | "phone";

/** Counts a tap on WhatsApp/Telegram/Instagram/VK/call for the owner. sendBeacon survives leaving the page for wa.me. */
export function trackContact(storeSlug: string, channel: ContactChannel, productId?: string) {
  const url = `/api/public/stores/${encodeURIComponent(storeSlug)}/contact-click`;
  const body = JSON.stringify({ channel, productId });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

/** wa.me link, optionally with a ready message. */
export function whatsappUrl(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The account name of a Telegram contact, if it's one: «@name», «name», «t.me/name». Null for invite links (t.me/+…). */
export function telegramUsername(value: string) {
  const name = value.trim().replace(/^https?:\/\//, "").replace(/^(t|telegram)\.me\//, "").replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9_]{4,32}$/.test(name) ? name : null;
}

/** A chat in Telegram; with `text`, the message is typed in for the buyer (t.me/<username>?text=), where the contact is an account. */
export function telegramUrl(value: string, text?: string) {
  const username = telegramUsername(value);
  if (username) return `https://t.me/${username}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  return value.startsWith("http") ? value : `https://t.me/${value.replace(/^@/, "")}`;
}

/** The account name from «@name», «name», «instagram.com/name/» or a full link. */
export function socialHandle(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const name = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
  return `@${name.replace(/^@/, "").split("?")[0]}`;
}

/** A chat with the account in Instagram Direct. */
export function instagramUrl(value: string) {
  return `https://ig.me/m/${socialHandle(value).slice(1)}`;
}

/** A chat with the page or community in VK messages. */
export function vkUrl(value: string) {
  return `https://vk.me/${socialHandle(value).slice(1)}`;
}

export function phoneUrl(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mapsUrl(address: string) {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
}

export function hasContacts(store: Pick<Store, "phone" | "whatsapp" | "telegram" | "instagram" | "vk">) {
  return Boolean(store.phone || store.whatsapp || store.telegram || store.instagram || store.vk);
}

/** Shares a link with the phone's share sheet, or copies it where sharing isn't available. */
export async function shareLink(url: string, title: string, copy: (text: string, message?: string) => Promise<boolean>) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch {
      // The buyer closed the share sheet.
    }
    return;
  }
  await copy(url, "Ссылка скопирована");
}
