import { AlertCircleIcon, PackageOpenIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import { Spinner } from "./Spinner";
import styles from "./States.module.css";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconSvgElement;
  /** Usually one primary button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon = PackageOpenIcon, action, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, className)}>
      <span className={styles.icon}>
        <Icon icon={icon} size="lg" strokeWidth={1.6} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action}
    </div>
  );
}

/** Replaces bare «Загрузка...» text. */
export function LoadingState({ label = "Загрузка…", className }: { label?: string; className?: string }) {
  return (
    <div className={cx(styles.state, styles.compact, className)} role="status">
      <Spinner size="lg" className={styles.spinner} />
      <p className={styles.description}>{label}</p>
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Shows a «Повторить» button. */
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = "Не удалось загрузить", description = "Проверьте интернет и попробуйте ещё раз.", onRetry, className }: ErrorStateProps) {
  return (
    <div className={cx(styles.state, className)} role="alert">
      <span className={cx(styles.icon, styles.iconDanger)}>
        <Icon icon={AlertCircleIcon} size="lg" strokeWidth={1.6} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {onRetry && (
        <Button variant="primary" icon={RefreshIcon} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
