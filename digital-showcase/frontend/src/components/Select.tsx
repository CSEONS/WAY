import { Check, ChevronDown } from "lucide-react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);

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
    const index = Math.max(0, options.findIndex((option) => option.value === value));
    setActiveIndex(index);
    setIsOpen(true);
  }

  function closeList() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function selectOption(option: SelectOption) {
    onChange(option.value);
    closeList();
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
    <div className="select-root" ref={rootRef}>
      <button
        type="button"
        className="select-trigger"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? setIsOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selected?.label ?? placeholder ?? ""}</span>
        <ChevronDown size={16} strokeWidth={2} />
      </button>
      {isOpen && (
        <ul
          className="select-popup"
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`select-option${index === activeIndex ? " is-active" : ""}${option.value === value ? " is-selected" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} strokeWidth={2} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
