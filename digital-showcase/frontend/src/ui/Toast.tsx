import { createContext, type ReactNode, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cx } from "./cx";
import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, options?: { tone?: ToastTone; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const regionRef = useRef<HTMLDivElement>(null);

  // A modal <dialog> sits in the browser's top layer, above any z-index.
  // Showing the region as a popover puts toasts in the top layer as well.
  // Browsers without the Popover API ignore the attribute and use z-index.
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== "function") return;
    const isOpen = region.matches(":popover-open");
    if (items.length && !isOpen) region.showPopover();
    if (!items.length && isOpen) region.hidePopover();
  }, [items]);

  const show = useCallback<ToastContextValue["show"]>((message, { tone = "neutral", duration = 2400 } = {}) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), duration);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div ref={regionRef} popover="manual" className={styles.region} aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cx(styles.toast, styles[item.tone])}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast.show("Сохранено"); */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

/** Copies text and reports the result with a toast. Works on plain http too. */
export function useCopyToClipboard() {
  const { show } = useToast();
  return useCallback(
    async (text: string, successMessage = "Скопировано") => {
      const isCopied = await copyText(text);
      show(isCopied ? successMessage : "Не удалось скопировать", { tone: isCopied ? "neutral" : "danger" });
      return isCopied;
    },
    [show]
  );
}

async function copyText(text: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (insecure origin, denied permission).
  }

  // An open modal <dialog> makes the rest of the page inert, so the helper
  // field has to live inside it to be selectable.
  const container = document.querySelector("dialog[open]") ?? document.body;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  container.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
