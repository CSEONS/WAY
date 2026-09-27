import type { SubscriptionInfo } from "../types/models";
import type { Tone } from "../ui";
import { formatDate, plural } from "./format";

function days(count: number) {
  return `${count} ${plural(count, ["день", "дня", "дней"])}`;
}

/** Short status for badges and lists: «до 12 октября», «отсрочка до 15 октября». */
export function subscriptionBadge(info: SubscriptionInfo | undefined): { tone: Tone; label: string } {
  if (!info) return { tone: "neutral", label: "" };
  switch (info.state) {
    case "unlimited":
      return { tone: "neutral", label: "Без даты окончания" };
    case "active":
      return { tone: "success", label: `Оплачено до ${formatDate(info.endsAt)}` };
    case "expiring":
      return { tone: "warning", label: info.daysLeft && info.daysLeft > 0 ? `Осталось ${days(info.daysLeft)}` : "Заканчивается сегодня" };
    case "grace":
      return { tone: "danger", label: `Отсрочка до ${formatDate(info.graceEndsAt)}` };
    case "expired":
      return { tone: "danger", label: `Закончилась ${formatDate(info.endsAt)}` };
    case "disabled":
      return { tone: "neutral", label: "Витрина выключена" };
  }
}

/** The owner's banner. null — nothing to warn about. */
export function subscriptionNotice(info: SubscriptionInfo | undefined): { tone: "warning" | "danger"; title: string; text: string } | null {
  if (!info) return null;
  if (info.state === "expiring") {
    const when = info.daysLeft && info.daysLeft > 0 ? `через ${days(info.daysLeft)}, ${formatDate(info.endsAt)}` : "сегодня";
    return { tone: "warning", title: `Подписка заканчивается ${when}`, text: "Чтобы витрина работала без перерыва, продлите подписку у администратора." };
  }
  if (info.state === "grace") {
    return {
      tone: "danger",
      title: "Подписка закончилась",
      text: `Витрина пока работает, но ${formatDate(info.graceEndsAt)} покупатели увидят «Магазин недоступен». Продлите подписку у администратора.`
    };
  }
  if (info.state === "expired") {
    return { tone: "danger", title: "Витрина отключена", text: `Подписка закончилась ${formatDate(info.endsAt)}. Покупатели не могут открыть витрину, пока подписка не продлена.` };
  }
  return null;
}
