import type { Store } from "../types/models";

export type ContactChannel = "whatsapp" | "telegram" | "phone";

/** Counts a tap on WhatsApp/Telegram/call for the owner. sendBeacon survives leaving the page for wa.me. */
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

export function telegramUrl(value: string) {
  return value.startsWith("http") ? value : `https://t.me/${value.replace(/^@/, "")}`;
}

export function phoneUrl(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function mapsUrl(address: string) {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
}

export function hasContacts(store: Pick<Store, "phone" | "whatsapp" | "telegram">) {
  return Boolean(store.phone || store.whatsapp || store.telegram);
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
