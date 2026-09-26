import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconSvgElement;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  size?: "sm" | "md";
  className?: string;
}

/** A few mutually exclusive modes, e.g. «Текст / Голос». */
export function SegmentedControl<T extends string>({ value, onChange, options, label, size = "md", className }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx(styles.segmented, styles[size], className)}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cx(styles.segment, isActive && styles.active)}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon icon={option.icon} size="sm" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
