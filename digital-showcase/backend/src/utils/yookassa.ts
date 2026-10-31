// ЮKassa API (https://yookassa.ru/developers/api): creating a payment the
// owner pays on ЮKassa's page and reading its status back. The shop's id and
// secret key come from YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY; without them
// online payment is simply not offered.

const API = "https://api.yookassa.ru/v3";

export type YookassaStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export interface YookassaPayment {
  id: string;
  status: YookassaStatus;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  cancellation_details?: { party: string; reason: string };
}

export interface YookassaReceipt {
  customer: { email?: string; phone?: string };
  items: {
    description: string;
    quantity: number;
    amount: { value: string; currency: "RUB" };
    vat_code: number;
    payment_subject: "service";
    payment_mode: "full_payment";
    measure: "piece";
  }[];
  tax_system_code?: number;
}

export interface NewYookassaPayment {
  amount: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  receipt?: YookassaReceipt;
}

/** ЮKassa answered with an error; `status` 404 — no such payment in this shop. */
export class YookassaError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function yookassaConfigured() {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

/** A receipt goes with every payment (54-ФЗ: «Чеки от ЮKassa» or the shop's own online register). */
export function yookassaReceiptsOn() {
  return process.env.YOOKASSA_RECEIPTS?.trim().toLowerCase() === "on";
}

/** «1500.00»: ЮKassa takes amounts as strings with kopecks. */
export function yookassaAmount(rubles: number) {
  return rubles.toFixed(2);
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const auth = Buffer.from(`${process.env.YOOKASSA_SHOP_ID?.trim()}:${process.env.YOOKASSA_SECRET_KEY?.trim()}`).toString("base64");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(idempotenceKey ? { "Idempotence-Key": idempotenceKey } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) {
    // { type: "error", code, description, parameter } — the description says what's wrong, in English.
    let description = text;
    try {
      const error = JSON.parse(text) as { description?: string; parameter?: string };
      description = [error.description, error.parameter && `(${error.parameter})`].filter(Boolean).join(" ") || text;
    } catch {
      // Not JSON: keep the text.
    }
    throw new YookassaError(response.status, `ЮKassa ${response.status}: ${description}`);
  }
  return JSON.parse(text) as T;
}

/** A payment with a redirect to ЮKassa's page; captured at once. The key makes a retry return the same payment. */
export function createYookassaPayment(input: NewYookassaPayment, idempotenceKey: string) {
  return call<YookassaPayment>(
    "POST",
    "/payments",
    {
      amount: { value: yookassaAmount(input.amount), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      // ЮKassa allows 128 characters; it's shown to the payer.
      description: input.description.slice(0, 128),
      metadata: input.metadata,
      ...(input.receipt ? { receipt: input.receipt } : {})
    },
    idempotenceKey
  );
}

export function getYookassaPayment(id: string) {
  return call<YookassaPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}
