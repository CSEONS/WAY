import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { useFieldControl } from "./Field";
import { Icon } from "./Icon";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Needed when the select is not inside a <Field>. */
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Which edge the option list lines up with. "end" for selects near the right edge of the screen. */
  menuAlign?: "start" | "end";
  className?: string;
}

export function Select({ value, onChange, options, ...rest }: SelectProps) {
  const selected = options.find((option) => option.value === value);
  return (
    <SelectBase
      {...rest}
      options={options}
      isSelected={(option) => option.value === value}
      onPick={(option) => {
        onChange(option.value);
        return true;
      }}
      triggerLabel={selected?.label}
    />
  );
}

export interface MultiSelectProps extends Omit<SelectProps, "value" | "onChange" | "placeholder"> {
  value: string[];
  onChange: (value: string[]) => void;
  /** The first option, it clears the choice: «Все категории». Also the trigger's text while nothing is chosen. */
  allLabel: string;
  /** The trigger's text for several chosen: «Категории: 2». */
  countLabel: (count: number) => string;
}

const ALL = "\u0000all";

/** Like Select, but options are ticked on and off and the list stays open. */
export function MultiSelect({ value, onChange, options, allLabel, countLabel, ...rest }: MultiSelectProps) {
  const chosen = options.filter((option) => value.includes(option.value));
  return (
    <SelectBase
      {...rest}
      multiple
      options={[{ value: ALL, label: allLabel }, ...options]}
      isSelected={(option) => (option.value === ALL ? chosen.length === 0 : value.includes(option.value))}
      onPick={(option) => {
        if (option.value === ALL) {
          onChange([]);
          return true;
        }
        onChange(value.includes(option.value) ? value.filter((item) => item !== option.value) : [...value, option.value]);
        return false;
      }}
      triggerLabel={chosen.length === 0 ? allLabel : chosen.length === 1 ? chosen[0].label : countLabel(chosen.length)}
    />
  );
}

interface SelectBaseProps extends Omit<SelectProps, "value" | "onChange"> {
  multiple?: boolean;
  isSelected: (option: SelectOption) => boolean;
  /** True — the list closes. */
  onPick: (option: SelectOption) => boolean;
  triggerLabel?: string;
}

function SelectBase({ options, ariaLabel, placeholder, disabled, id, menuAlign = "start", className, multiple, isSelected, onPick, triggerLabel }: SelectBaseProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const control = useFieldControl({ id });

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.focus();

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  function openList() {
    setActiveIndex(Math.max(0, options.findIndex(isSelected)));
    setIsOpen(true);
  }

  function closeList() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(option: SelectOption) {
    if (onPick(option)) closeList();
  }

  function onTriggerKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openList();
    }
  }

  function onListKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (options[activeIndex]) selectOption(options[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeList();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  }

  return (
    <div className={cx(styles.root, menuAlign === "end" && styles.alignEnd, className)} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        ref={triggerRef}
        id={control.id}
        aria-describedby={control["aria-describedby"]}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={cx(styles.value, !triggerLabel && styles.placeholder)}>{triggerLabel ?? placeholder ?? ""}</span>
        <Icon icon={ArrowDown01Icon} size="sm" className={styles.chevron} />
      </button>
      {isOpen && (
        <ul
          className={styles.popup}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable={multiple || undefined}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => {
            const selected = isSelected(option);
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                className={cx(styles.option, index === activeIndex && styles.active, selected && styles.selected)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span>{option.label}</span>
                {selected && <Icon icon={Tick02Icon} size="sm" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
