import { cx } from "./cx";
import styles from "./Spinner.module.css";

export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return <span className={cx(styles.spinner, styles[size], className)} aria-hidden="true" />;
}
