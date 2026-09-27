import { sendTelegram } from "../utils/telegram.js";

// The same problem is reported once per this window, not on every request.
const REPEAT_AFTER_MS = 10 * 60 * 1000;
const lastSent = new Map<string, number>();

/**
 * A server error the admin should know about: logged and sent to Telegram
 * (TELEGRAM_ALERT_CHAT_ID or TELEGRAM_CHAT_ID). Repeats are held back.
 */
export async function reportProblem(title: string, error?: unknown, context?: string) {
  const message = error instanceof Error ? error.message : error ? String(error) : "";
  console.error(title, context ?? "", error ?? "");

  const key = `${title}|${message}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - REPEAT_AFTER_MS) return false;
  lastSent.set(key, now);

  const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(1, 4).map((line) => line.trim()).join("\n") : "";
  const host = process.env.PUBLIC_ORIGIN || process.env.CORS_ORIGIN || "";
  return sendTelegram([`⚠️ ${title}${host ? ` — ${host}` : ""}`, context, message, stack].filter(Boolean).join("\n"), "alerts");
}
