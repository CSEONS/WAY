import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Chip.module.css";

export type ChipProps = Omit<ComponentProps<"button">, "children"> & {
  /** Selected/active state. Also exposed as aria-pressed. */
  selected?: boolean;
  /** Dashed outline for "not set yet" values like «Уточнить у продавца». */
  dashed?: boolean;
  icon?: IconSvgElement;
  iconEnd?: IconSvgElement;
  /** Small counter bubble, e.g. number of active filters. */
  count?: number;
  children?: ReactNode;
};

/** Small toggle button: a size, a filter, a category. */
export function Chip({ selected, dashed, icon, iconEnd, count, type = "button", className, children, ...rest }: ChipProps) {
  // A chip that opens a panel (aria-expanded) is a disclosure, not a toggle.
  const isToggle = selected !== undefined && !("aria-expanded" in rest);
  return (
    <button
      type={type}
      className={cx(styles.chip, selected && styles.selected, dashed && styles.dashed, className)}
      aria-pressed={isToggle ? selected : undefined}
      {...rest}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
      {count !== undefined && count > 0 && <span className={styles.count}>{count}</span>}
      {iconEnd && <Icon icon={iconEnd} size="sm" />}
    </button>
  );
}

export interface ChipGroupProps {
  children: ReactNode;
  /** Accessible name of the group, e.g. "Размер". */
  label?: string;
  /** One horizontally scrolling row instead of wrapping lines. */
  scroll?: boolean;
  className?: string;
}

export function ChipGroup({ children, label, scroll, className }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className={cx(styles.group, scroll && styles.scroll, className)}>
      {children}
    </div>
  );
}

export type ColorSwatchProps = Omit<ComponentProps<"button">, "color" | "children"> & {
  /** Any CSS color. Falls back to a neutral tint when missing. */
  color?: string | null;
  /** Color name — the tooltip and the accessible name. Omit when the name is written next to the swatch. */
  label?: string;
  size?: "sm" | "md" | "lg";
  selected?: boolean;
};

/**
 * A color dot. With onClick (or other pointer handlers) it becomes a toggle
 * button; otherwise it is a static label.
 */
export function ColorSwatch({ color, label, size = "md", selected, className, style, ...buttonProps }: ColorSwatchProps) {
  const swatchStyle = { ...style, "--swatch-color": color || "var(--color-surface-hover)" } as CSSProperties;
  const isInteractive = Boolean(buttonProps.onClick || buttonProps.onPointerDown || buttonProps.onPointerUp);
  const classes = cx(styles.swatch, styles[size], selected && styles.swatchSelected, isInteractive && styles.swatchButton, className);

  if (isInteractive) {
    return (
      <button
        type="button"
        className={classes}
        style={swatchStyle}
        aria-label={label}
        title={label}
        aria-pressed={selected === undefined ? undefined : selected}
        {...buttonProps}
      />
    );
  }
  if (!label) return <span className={classes} style={swatchStyle} aria-hidden="true" />;
  return <span className={classes} style={swatchStyle} role="img" aria-label={label} title={label} />;
}
