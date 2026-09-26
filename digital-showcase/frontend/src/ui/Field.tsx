import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { createContext, useContext, useId, type ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import styles from "./Field.module.css";

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Lets a control inside <Field> pick up the label id, hint/error ids and invalid state. */
export function useFieldControl(props: { id?: string; "aria-describedby"?: string; invalid?: boolean }) {
  const field = useContext(FieldContext);
  const invalid = props.invalid ?? field?.invalid ?? false;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": props["aria-describedby"] ?? field?.describedBy,
    "aria-invalid": invalid || undefined
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Short help text under the control. */
  hint?: ReactNode;
  /** Validation message. Replaces the hint and marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error || hint;

  return (
    <FieldContext.Provider value={{ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) }}>
      <div className={cx(styles.field, className)}>
        <label className={styles.label} htmlFor={id}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          )}
        </label>
        {children}
        {error ? (
          <span id={messageId} className={styles.error}>
            <Icon icon={AlertCircleIcon} size="xs" />
            {error}
          </span>
        ) : (
          hint && (
            <span id={messageId} className={styles.hint}>
              {hint}
            </span>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}
