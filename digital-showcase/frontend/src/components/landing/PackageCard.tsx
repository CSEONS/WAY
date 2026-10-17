import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import type { PackageView } from "../../types/models";
import { Card, Icon } from "../../ui";
import { plural } from "../../utils/format";
// Looks like a plan card and lines up the same way in a row (`.plans > *`).
import styles from "./PlanCard.module.css";

/** «+10 ИИ-превью», «+100 карточек с ИИ», «Сделаем за вас» — what a package gives, line by line. */
export function packageLines(item: Pick<PackageView, "previews" | "fills" | "isService">) {
  const lines: string[] = [];
  if (item.previews > 0) lines.push(`+${item.previews} ИИ-превью`);
  if (item.fills > 0) lines.push(`+${item.fills} ${plural(item.fills, ["карточка", "карточки", "карточек"])} с ИИ`);
  if (item.isService) lines.push("Сделаем за вас после оплаты");
  return lines;
}

/** «+10 ИИ-превью, +100 карточек с ИИ» — in one line, for pickers and lists. */
export function packageSummary(item: Pick<PackageView, "previews" | "fills" | "isService">) {
  return packageLines(item).join(", ");
}

/**
 * A package bought on top of a plan, once: on the landing, on the owner's
 * «Подписка» and on «Тарифы и цены». Same four parts as a plan card — head,
 * price, what's in it, action.
 */
export function PackageCard({ item, action }: { item: PackageView; action?: ReactNode }) {
  return (
    <Card padding="lg" className={styles.plan}>
      <div className={styles.head}>
        <h3 className={styles.title}>{item.name}</h3>
        {item.description && <p className={styles.text}>{item.description}</p>}
      </div>
      <p className={styles.price}>
        {item.price > 0 ? (
          <>
            {item.price.toLocaleString("ru-RU")} ₽ <small>разово</small>
          </>
        ) : (
          "Бесплатно"
        )}
      </p>
      <ul className={styles.features}>
        {packageLines(item).map((line) => (
          <li key={line}>
            <Icon icon={CheckmarkCircle02Icon} size="sm" />
            {line}
          </li>
        ))}
      </ul>
      {action}
    </Card>
  );
}
