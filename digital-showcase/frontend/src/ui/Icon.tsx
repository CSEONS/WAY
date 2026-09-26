import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cx } from "./cx";
import styles from "./Icon.module.css";

export type { IconSvgElement };
export type IconSize = "xs" | "sm" | "md" | "lg";

const pixels: Record<IconSize, number> = { xs: 14, sm: 16, md: 20, lg: 24 };

export interface IconProps {
  icon: IconSvgElement;
  size?: IconSize;
  strokeWidth?: number;
  /** Accessible name. Without it the icon is decorative and hidden from screen readers. */
  label?: string;
  className?: string;
}

export function Icon({ icon, size = "md", strokeWidth = 1.8, label, className }: IconProps) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={pixels[size]}
      strokeWidth={strokeWidth}
      className={cx(styles.icon, styles[size], className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
