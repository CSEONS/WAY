import { cx } from "./cx";
import styles from "./ProgressBar.module.css";

export function ProgressBar({ value, label, className }: { value: number; label?: string; className?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cx(styles.track, className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={label}>
      <div className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
