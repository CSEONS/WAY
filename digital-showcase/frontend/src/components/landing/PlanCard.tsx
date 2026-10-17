import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import type { Plan } from "../../types/models";
import { Card, Icon, cx } from "../../ui";
import styles from "./PlanCard.module.css";

/**
 * A plan as buyers of the service see it: on the landing and, as a preview,
 * on «Тарифы и цены» in the admin panel. `highlighted` — the plan most people
 * should pick; `extra` — a feature line made from settings (the AI limit);
 * `action` — the button under it, if any.
 */
export function PlanCard({ plan, highlighted = false, extra, action }: { plan: Plan; highlighted?: boolean; extra?: string; action?: ReactNode }) {
  const features = extra ? [...plan.features, extra] : plan.features;
  return (
    <Card padding="lg" className={cx(styles.plan, highlighted && styles.highlighted)}>
      <div className={styles.head}>
        <h3 className={styles.title}>{plan.name}</h3>
        {plan.description && <p className={styles.text}>{plan.description}</p>}
      </div>
      <p className={styles.price}>
        {plan.price != null ? (
          <>
            {plan.price.toLocaleString("ru-RU")} ₽ <small>в месяц</small>
          </>
        ) : (
          "Цена по запросу"
        )}
      </p>
      {features.length > 0 && (
        <ul className={styles.features}>
          {features.map((feature, index) => (
            // Two lines may read the same: the position keeps React from mixing them up.
            <li key={`${index}-${feature}`}>
              <Icon icon={CheckmarkCircle02Icon} size="sm" />
              {feature}
            </li>
          ))}
        </ul>
      )}
      {action}
    </Card>
  );
}
