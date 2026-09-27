/**
 * A message to the admin's Telegram through the bot in TELEGRAM_BOT_TOKEN.
 * `chat`: "leads" — landing requests (TELEGRAM_CHAT_ID), "alerts" — server
 * problems (TELEGRAM_ALERT_CHAT_ID, or the same chat). Never throws.
 */
export async function sendTelegram(text: string, chat: "leads" | "alerts" = "leads") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chat === "alerts" ? process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID : process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Telegram rejects messages over 4096 characters.
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) console.error("Telegram message failed", response.status, await response.text());
    return response.ok;
  } catch (error) {
    console.error("Telegram message failed", error);
    return false;
  }
}
