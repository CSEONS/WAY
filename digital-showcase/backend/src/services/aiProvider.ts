import { HttpError } from "../utils/http.js";
import { reportTokens } from "./aiUsageService.js";

// The AI provider behind product drafts. Switching providers is a matter of
// .env: any OpenAI-compatible API works, in one of two request formats.
//   responses — OpenAI's Responses API (/responses): OpenAI itself.
//   chat      — Chat Completions (/chat/completions): OpenRouter, Yandex AI
//               Studio, DeepSeek, local servers and most others.
// Voice is transcribed through /audio/transcriptions, which can point at a
// different provider (AI_TRANSCRIBE_*) or be switched off.

export type AiApiStyle = "responses" | "chat";

/** Values from .env.example that mean «not filled in». */
const PLACEHOLDERS = new Set(["API_KEY", "your-key", "replace-me"]);

function env(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value && !PLACEHOLDERS.has(value)) return value;
  }
  return "";
}

export function aiSettings() {
  const apiKey = env("AI_API_KEY", "OPENAI_API_KEY");
  const baseUrl = (env("AI_BASE_URL", "OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const style: AiApiStyle = env("AI_API_STYLE").toLowerCase() === "chat" ? "chat" : "responses";
  const timeout = Number(env("AI_TIMEOUT_MS", "OPENAI_TIMEOUT_MS"));
  const transcribeModel = env("AI_TRANSCRIBE_MODEL", "OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
  return {
    apiKey,
    baseUrl,
    model: env("AI_MODEL", "OPENAI_MODEL") || "gpt-5.6",
    style,
    /** Ask for a JSON object explicitly; switch off (AI_JSON_MODE=off) for providers that reject response_format. */
    jsonMode: env("AI_JSON_MODE").toLowerCase() !== "off",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 45000,
    transcribe:
      transcribeModel.toLowerCase() === "off"
        ? null
        : {
            baseUrl: (env("AI_TRANSCRIBE_BASE_URL") || baseUrl).replace(/\/+$/, ""),
            apiKey: env("AI_TRANSCRIBE_API_KEY") || apiKey,
            model: transcribeModel
          }
  };
}

export function isAiConfigured() {
  return Boolean(aiSettings().apiKey);
}

/** What the admin panel shows: where requests go, never the key. */
export function aiSummary() {
  const settings = aiSettings();
  return {
    configured: Boolean(settings.apiKey),
    host: new URL(settings.baseUrl).host,
    model: settings.model,
    style: settings.style,
    voice: settings.transcribe ? `${new URL(settings.transcribe.baseUrl).host} · ${settings.transcribe.model}` : null
  };
}

function errorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } | string }).error;
    const message = typeof error === "string" ? error : error?.message;
    if (message) return `AI-провайдер вернул ошибку: ${message}`;
  }
  if (typeof payload === "string" && payload.trim()) return `AI-провайдер вернул ошибку: ${payload.trim().slice(0, 300)}`;
  return "AI-провайдер временно недоступен";
}

async function post(url: string, apiKey: string, body: unknown, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new HttpError(502, timedOut ? "AI-провайдер не ответил вовремя, попробуйте ещё раз" : "Не удалось связаться с AI-провайдером");
  }
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Plain-text error pages stay as text.
  }
  if (!response.ok) throw new HttpError(502, errorMessage(payload));
  const usage = payload && typeof payload === "object" ? (payload as { usage?: unknown }).usage : null;
  reportTokens(usage);
  return payload;
}

/** Text of a Responses API answer. */
function responsesText(payload: unknown) {
  if (payload && typeof payload === "object" && typeof (payload as { output_text?: unknown }).output_text === "string") {
    return (payload as { output_text: string }).output_text;
  }
  const parts: string[] = [];
  const output = payload && typeof payload === "object" ? (payload as { output?: unknown[] }).output : [];
  for (const item of Array.isArray(output) ? output : []) {
    const content = item && typeof item === "object" ? (item as { content?: unknown[] }).content : [];
    for (const block of Array.isArray(content) ? content : []) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") parts.push((block as { text: string }).text);
    }
  }
  return parts.join("\n");
}

/** Text of a Chat Completions answer (content is a string or a list of parts). */
function chatText(payload: unknown) {
  const choices = payload && typeof payload === "object" ? (payload as { choices?: { message?: { content?: unknown } }[] }).choices : undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).join("");
  }
  return "";
}

export interface JsonRequest {
  /** System instructions. */
  instructions: string;
  /** The user's message. */
  text: string;
  /** data: or https: image URLs. */
  images?: string[];
}

/** Asks the model for a JSON answer and returns its raw text (the caller parses it). */
export async function completeJson({ instructions, text, images = [] }: JsonRequest) {
  const settings = aiSettings();
  if (!settings.apiKey) throw new HttpError(503, "ИИ не настроен: укажите AI_API_KEY на сервере");

  if (settings.style === "chat") {
    const content = images.length
      ? [{ type: "text", text }, ...images.map((url) => ({ type: "image_url", image_url: { url, detail: "low" } }))]
      : text;
    const payload = await post(
      `${settings.baseUrl}/chat/completions`,
      settings.apiKey,
      {
        model: settings.model,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content }
        ],
        ...(settings.jsonMode ? { response_format: { type: "json_object" } } : {})
      },
      settings.timeoutMs
    );
    return chatText(payload);
  }

  const payload = await post(
    `${settings.baseUrl}/responses`,
    settings.apiKey,
    {
      model: settings.model,
      instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text }, ...images.map((url) => ({ type: "input_image", image_url: url, detail: "low" }))]
        }
      ],
      ...(settings.jsonMode ? { text: { format: { type: "json_object" } } } : {}),
      store: false
    },
    settings.timeoutMs
  );
  return responsesText(payload);
}

export interface AudioFile {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}

/** Speech to text for voice descriptions. */
export async function transcribe(file: AudioFile, prompt: string) {
  const settings = aiSettings().transcribe;
  if (!settings) throw new HttpError(503, "Голосовой ввод отключён на сервере — опишите товар текстом");
  if (!settings.apiKey) throw new HttpError(503, "ИИ не настроен: укажите AI_API_KEY на сервере");

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "audio/webm" }), file.filename);
  form.append("model", settings.model);
  form.append("response_format", "text");
  form.append("prompt", prompt);

  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(aiSettings().timeoutMs)
    });
  } catch {
    throw new HttpError(502, "Не удалось распознать голос: AI-провайдер недоступен");
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body: unknown = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text();
  if (response.status === 404) throw new HttpError(502, "Этот AI-провайдер не распознаёт голос — опишите товар текстом или настройте AI_TRANSCRIBE_*");
  if (!response.ok) throw new HttpError(502, errorMessage(body));
  if (typeof body === "string") return body;
  return String((body as { text?: unknown } | null)?.text ?? "");
}
