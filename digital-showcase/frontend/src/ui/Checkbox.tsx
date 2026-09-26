import { Tick02Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text next to the box; may contain links. */
  label: ReactNode;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

/** A checkbox with its label, e.g. consent to personal data processing. For on/off settings use Switch. */
export function Checkbox({ checked, onChange, label, required, disabled, invalid, className }: CheckboxProps) {
  return (
    <label className={cx(styles.checkbox, disabled && styles.disabled, className)}>
      <input
        type="checkbox"
        className={styles.input}
        checked={checked}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={cx(styles.box, invalid && styles.invalid)} aria-hidden="true">
        <Icon icon={Tick02Icon} size="xs" strokeWidth={2.4} />
      </span>
      <span className={styles.label}>{label}</span>
    </label>
  );
}
