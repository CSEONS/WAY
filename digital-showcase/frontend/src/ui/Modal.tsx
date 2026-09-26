import { Alert02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./Button";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Modal.module.css";

let scrollLocks = 0;
let previousBodyOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = previousBodyOverflow;
}

export interface ModalProps {
  title: ReactNode;
  description?: ReactNode;
  /** Called on the close button, Escape and a tap on the backdrop. The parent unmounts the modal. */
  onClose: () => void;
  children?: ReactNode;
  /** Action buttons; they share the row equally. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Icon in a tinted square above the title. */
  icon?: IconSvgElement;
  tone?: "default" | "danger";
  hideCloseButton?: boolean;
  /** Set to false for forms, so a stray tap outside does not throw the input away. */
  closeOnBackdrop?: boolean;
  /** Turns the modal into a form: Enter and a type="submit" footer button call it. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

/**
 * Built on the native <dialog>: focus stays inside, Escape closes, the page
 * behind is inert. A bottom sheet on phones, centered from 720px.
 * Render it conditionally: {isOpen && <Modal ... />}.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  icon,
  tone = "default",
  hideCloseButton,
  closeOnBackdrop = true,
  onSubmit,
  className
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const pressStartedOnBackdrop = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // The browser focuses the first focusable element (the close button).
    // Prefer the first text field so the user can type right away.
    bodyRef.current
      ?.querySelector<HTMLElement>("input:not([type=hidden]):not([type=color]):not([type=file]):not([type=checkbox]), textarea")
      ?.focus();
    lockScroll();
    return () => {
      unlockScroll();
      if (dialog.open) dialog.close();
      previouslyFocused?.focus();
    };
  }, []);

  const content = (
    <>
      <div className={styles.head}>
        <div className={styles.heading}>
          {icon && (
            <span className={cx(styles.iconBox, tone === "danger" && styles.iconDanger)}>
              <Icon icon={icon} size="md" />
            </span>
          )}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
        </div>
        {!hideCloseButton && <IconButton icon={Cancel01Icon} label="Закрыть" onClick={() => onCloseRef.current()} />}
      </div>
      {children && (
        <div className={styles.body} ref={bodyRef}>
          {children}
        </div>
      )}
      {footer && <div className={styles.footer}>{footer}</div>}
    </>
  );

  // Portaled to <body>: outside any page <form> (no accidental submits) and
  // outside page layout selectors.
  return createPortal(
    <dialog
      ref={dialogRef}
      className={cx(styles.dialog, styles[size], className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onPointerDown={(event) => {
        // The panel fills the dialog box, so only the backdrop hits the <dialog> itself.
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (closeOnBackdrop && pressStartedOnBackdrop.current && event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      {onSubmit ? (
        <form
          className={styles.panel}
          onSubmit={(event) => {
            // React bubbles events through portals: don't let this submit
            // reach a <form> the modal was rendered from.
            event.stopPropagation();
            onSubmit(event);
          }}
        >
          {content}
        </form>
      ) : (
        <div className={styles.panel}>{content}</div>
      )}
    </dialog>,
    document.body
  );
}



export interface ConfirmModalProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button and a warning icon — for deleting and other irreversible actions. */
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({ title, description, confirmLabel, cancelLabel = "Отмена", danger, onCancel, onConfirm }: ConfirmModalProps) {
  const [isBusy, setIsBusy] = useState(false);

  async function confirm() {
    setIsBusy(true);
    try {
      await onConfirm();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Modal
      size="sm"
      title={title}
      description={description}
      icon={danger ? Alert02Icon : undefined}
      tone={danger ? "danger" : "default"}
      hideCloseButton
      onClose={onCancel}
      footer={
        <>
          <Button variant="neutral" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={isBusy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
