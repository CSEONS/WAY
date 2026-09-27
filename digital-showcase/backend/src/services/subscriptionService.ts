import type { Store } from "../types/models.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** After the paid date the storefront keeps working this long, with a banner for the owner. */
export const GRACE_DAYS = 3;
/** Warn the owner this many days before the paid date. */
export const WARNING_DAYS = 7;

/** Free period for a newly connected store. */
export function trialDays() {
  const days = Number(process.env.TRIAL_DAYS);
  return Number.isInteger(days) && days > 0 ? days : 14;
}

export type SubscriptionState =
  /** No end date: works until the admin sets one. */
  | "unlimited"
  | "active"
  /** Paid, but ends within WARNING_DAYS. */
  | "expiring"
  /** Ended less than GRACE_DAYS ago: the storefront still works. */
  | "grace"
  | "expired"
  /** Turned off by the admin. */
  | "disabled";

export interface SubscriptionInfo {
  state: SubscriptionState;
  endsAt: string | null;
  /** When the storefront actually closes: endsAt + GRACE_DAYS. */
  graceEndsAt: string | null;
  /** Whole days until endsAt, rounded up; negative once it has passed. */
  daysLeft: number | null;
}

export function subscriptionInfo(store: Pick<Store, "isActive" | "subscriptionEndsAt">, now = Date.now()): SubscriptionInfo {
  const endsAtMs = store.subscriptionEndsAt ? Date.parse(store.subscriptionEndsAt) : NaN;
  if (Number.isNaN(endsAtMs)) {
    return { state: store.isActive ? "unlimited" : "disabled", endsAt: null, graceEndsAt: null, daysLeft: null };
  }

  const graceEndsAtMs = endsAtMs + GRACE_DAYS * DAY_MS;
  const daysLeft = Math.ceil((endsAtMs - now) / DAY_MS);
  const state: SubscriptionState = !store.isActive
    ? "disabled"
    : now <= endsAtMs
      ? daysLeft <= WARNING_DAYS
        ? "expiring"
        : "active"
      : now <= graceEndsAtMs
        ? "grace"
        : "expired";
  return { state, endsAt: new Date(endsAtMs).toISOString(), graceEndsAt: new Date(graceEndsAtMs).toISOString(), daysLeft };
}

/** Buyers can open the storefront. */
export function isStorefrontOpen(store: Pick<Store, "isActive" | "subscriptionEndsAt">, now = Date.now()) {
  const { state } = subscriptionInfo(store, now);
  return state !== "disabled" && state !== "expired";
}

/** Store as the owner and admin panels see it: with the computed subscription state. */
export function withSubscription<T extends Pick<Store, "isActive" | "subscriptionEndsAt">>(store: T) {
  return { ...store, subscription: subscriptionInfo(store) };
}

/**
 * Where a paid period starts: from the old end date if the store is still
 * running (including the grace days — they are not free), otherwise from today.
 */
export function extensionBase(store: Pick<Store, "subscriptionEndsAt">, now = Date.now()) {
  const endsAtMs = store.subscriptionEndsAt ? Date.parse(store.subscriptionEndsAt) : NaN;
  if (!Number.isNaN(endsAtMs) && endsAtMs + GRACE_DAYS * DAY_MS >= now) return new Date(endsAtMs);
  return new Date(now);
}

/** Calendar months: 31 January + 1 month = 28/29 February, not 3 March. */
export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
