import type { MonthReport, SubscriptionInfo } from "../types/models";
import { formatDate, formatMonth, plural } from "./format";

function times(count: number) {
  return `${count.toLocaleString("ru-RU")} ${plural(count, ["раз", "раза", "раз"])}`;
}

/** One line per number: «витрину открыли 340 раз». Shared by the owner's page and the WhatsApp report. */
export function reportLines(report: MonthReport) {
  return [
    `витрину открыли ${times(report.storeViews)}`,
    `товары посмотрели ${times(report.productViews)}`,
    `написали или позвонили ${times(report.contactClicks)}`,
    report.newProducts ? `добавлено ${report.newProducts} ${plural(report.newProducts, ["товар", "товара", "товаров"])}` : ""
  ].filter(Boolean);
}

/** The monthly report for the owner, ready to send in WhatsApp. */
export function reportMessage(input: { ownerName: string; storeName: string; report: MonthReport; subscription?: SubscriptionInfo }) {
  const { report, subscription } = input;
  const top = report.topProducts.map((product) => product.title);
  return [
    `Здравствуйте, ${input.ownerName}! Итоги витрины «${input.storeName}» за ${formatMonth(report.month)}:`,
    ...reportLines(report).map((line) => `• ${line}`),
    top.length ? `Чаще всего смотрели: ${top.join(", ")}.` : "",
    subscription?.endsAt && subscription.state !== "expired" ? `Подписка оплачена до ${formatDate(subscription.endsAt)}.` : "",
    report.contactClicks === 0 && report.storeViews < 20
      ? "Совет: отправьте ссылку на витрину в статус WhatsApp и повесьте QR-плакат на кассе — так покупатели узнают о ней."
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}
