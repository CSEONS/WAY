import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { Icon, cx } from "../../ui";
import styles from "./FavoriteButton.module.css";

interface FavoriteButtonProps {
  active: boolean;
  onToggle: () => void;
  /** `overlay` sits on a photo, `plain` next to text. */
  variant?: "overlay" | "plain";
  className?: string;
}

/** The heart: saves a product to this browser's favorites for the store. */
export function FavoriteButton({ active, onToggle, variant = "plain", className }: FavoriteButtonProps) {
  const label = active ? "Убрать из избранного" : "В избранное";
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], active && styles.active, className)}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The heart lives on top of a product link.
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon icon={FavouriteIcon} size="md" />
    </button>
  );
}
