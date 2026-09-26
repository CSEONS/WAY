import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Menu.module.css";

export interface MenuItem {
  label: string;
  icon?: IconSvgElement;
  onSelect: () => void;
  danger?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger, e.g. «Операции владельца Анна». */
  label: string;
  icon?: IconSvgElement;
  items: MenuItem[];
  className?: string;
}

/** A «⋮» button that opens a short list of actions. */
export function Menu({ label, icon = MoreVerticalIcon, items, className }: MenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  function onListKeyDown(event: KeyboardEvent) {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div className={cx(styles.root, className)} ref={rootRef}>
      <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)} />
      {isOpen && (
        <div className={styles.menu} role="menu" aria-label={label} ref={listRef} onKeyDown={onListKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx(styles.item, item.danger && styles.danger)}
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
            >
              {item.icon && <Icon icon={item.icon} size="sm" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
