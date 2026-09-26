import { Alert02Icon, CheckmarkCircle02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Notice.module.css";

export type NoticeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const defaultIcons: Record<NoticeTone, IconSvgElement> = {
  neutral: InformationCircleIcon,
  accent: InformationCircleIcon,
  success: CheckmarkCircle02Icon,
  warning: Alert02Icon,
  danger: Alert02Icon
};

export interface NoticeProps {
  tone?: NoticeTone;
  icon?: IconSvgElement;
  title?: ReactNode;
  children?: ReactNode;
  /** A small button on the right, e.g. «Очистить». */
  action?: ReactNode;
  className?: string;
}

/** Inline message inside a page or form: errors, confirmations, hints. */
export function Notice({ tone = "neutral", icon, title, children, action, className }: NoticeProps) {
  return (
    <div className={cx(styles.notice, styles[tone], className)} role={tone === "danger" ? "alert" : "status"}>
      <Icon icon={icon ?? defaultIcons[tone]} size="sm" className={styles.icon} />
      <div className={styles.content}>
        {title && <strong className={styles.title}>{title}</strong>}
        {children && <span className={styles.text}>{children}</span>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
