import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { useState, type ComponentProps } from "react";
import { cx } from "./cx";
import { useFieldControl } from "./Field";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Input.module.css";

export type InputProps = ComponentProps<"input"> & {
  /** Marks the field invalid. Inside <Field error> this is set automatically. */
  invalid?: boolean;
  /** Icon inside the field on the left, e.g. a search glass. */
  icon?: IconSvgElement;
};

export function Input({ id, invalid, icon, className, "aria-describedby": describedBy, ...rest }: InputProps) {
  const control = useFieldControl({ id, invalid, "aria-describedby": describedBy });
  const input = <input className={cx(styles.control, icon && styles.withIcon, !icon && className)} {...control} {...rest} />;
  if (!icon) return input;

  return (
    <span className={cx(styles.iconWrap, className)}>
      <Icon icon={icon} size="sm" className={styles.leadingIcon} />
      {input}
    </span>
  );
}

export type PasswordInputProps = Omit<InputProps, "type" | "icon">;

/** Password field with an eye button that shows or hides what was typed. */
export function PasswordInput({ id, invalid, className, "aria-describedby": describedBy, ...rest }: PasswordInputProps) {
  const control = useFieldControl({ id, invalid, "aria-describedby": describedBy });
  const [isVisible, setIsVisible] = useState(false);
  const label = isVisible ? "Скрыть пароль" : "Показать пароль";

  return (
    <span className={cx(styles.iconWrap, className)}>
      <input className={cx(styles.control, styles.withTrailing)} {...control} {...rest} type={isVisible ? "text" : "password"} />
      <button
        type="button"
        className={styles.trailingButton}
        onClick={() => setIsVisible((value) => !value)}
        aria-label={label}
        aria-pressed={isVisible}
        title={label}
        disabled={rest.disabled}
      >
        <Icon icon={isVisible ? ViewOffSlashIcon : ViewIcon} size="sm" />
      </button>
    </span>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ id, invalid, className, "aria-describedby": describedBy, ...rest }: TextareaProps) {
  const control = useFieldControl({ id, invalid, "aria-describedby": describedBy });
  return <textarea className={cx(styles.control, styles.textarea, className)} {...control} {...rest} />;
}
