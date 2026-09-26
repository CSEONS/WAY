import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Badge.module.css";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
  tone?: Tone;
  icon?: IconSvgElement;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {icon && <Icon icon={icon} size="xs" />}
      {children}
    </span>
  );
}

/** Colored dot with a label: «Активен», «В архиве». */
export function StatusDot({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx(styles.status, className)}>
      <span className={cx(styles.dot, styles[`dot-${tone}`])} aria-hidden="true" />
      {children}
    </span>
  );
}
