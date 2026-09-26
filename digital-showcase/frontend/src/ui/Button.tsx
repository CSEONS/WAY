import type { ComponentProps, ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { cx } from "./cx";
import { Icon, type IconSize, type IconSvgElement } from "./Icon";
import { Spinner } from "./Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "neutral" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the full width of the container. */
  block?: boolean;
}

interface ButtonContentProps {
  /** Icon before the label. */
  icon?: IconSvgElement;
  /** Icon after the label (e.g. a chevron). */
  iconEnd?: IconSvgElement;
  children?: ReactNode;
}

const labelIconSize: Record<ButtonSize, IconSize> = { sm: "sm", md: "sm", lg: "md" };
const iconOnlySize: Record<ButtonSize, IconSize> = { sm: "sm", md: "md", lg: "md" };

function buttonClassName({ variant = "neutral", size = "md", block }: ButtonStyleProps, iconOnly: boolean, className?: string) {
  return cx(styles.button, styles[variant], styles[size], block && styles.block, iconOnly && styles.iconOnly, className);
}

function ButtonContent({ icon, iconEnd, children, size = "md", loading }: ButtonContentProps & { size?: ButtonSize; loading?: boolean }) {
  const iconSize = labelIconSize[size];
  return (
    <>
      {loading ? <Spinner size="sm" /> : icon && <Icon icon={icon} size={iconSize} />}
      {children}
      {iconEnd && <Icon icon={iconEnd} size={iconSize} />}
    </>
  );
}

export type ButtonProps = ButtonStyleProps & ButtonContentProps & ComponentProps<"button"> & { loading?: boolean };

export function Button({ variant, size, block, icon, iconEnd, loading, disabled, type = "button", className, children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, block }, false, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <ButtonContent icon={icon} iconEnd={iconEnd} size={size} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

type LinkTarget =
  | { to: To; state?: unknown; replace?: boolean; href?: never }
  | { href: string; to?: never; state?: never; replace?: never };

export type ButtonLinkProps = ButtonStyleProps & ButtonContentProps & Omit<ComponentProps<"a">, "href"> & LinkTarget;

/** A link that looks like a button. `to` navigates inside the app, `href` is a plain link (downloads, external). */
export function ButtonLink({ variant, size, block, icon, iconEnd, className, children, ...rest }: ButtonLinkProps) {
  const classes = buttonClassName({ variant, size, block }, false, className);
  const content = (
    <ButtonContent icon={icon} iconEnd={iconEnd} size={size}>
      {children}
    </ButtonContent>
  );
  if (rest.to !== undefined) {
    const { to, state, replace, ...anchorProps } = rest;
    return (
      <Link to={to} state={state} replace={replace} className={classes} {...anchorProps}>
        {content}
      </Link>
    );
  }
  return (
    <a className={classes} {...rest}>
      {content}
    </a>
  );
}

export interface FileButtonProps extends ButtonStyleProps {
  icon?: IconSvgElement;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Called with the chosen files; not called when the picker is cancelled. */
  onFiles: (files: File[]) => void;
  children: ReactNode;
  className?: string;
}

/** A button that opens the file picker (photos, logo). */
export function FileButton({ variant = "secondary", size = "md", block, icon, accept, multiple, disabled, onFiles, children, className }: FileButtonProps) {
  return (
    <label className={buttonClassName({ variant, size, block }, false, cx(styles.fileButton, disabled && styles.fileDisabled, className))}>
      {icon && <Icon icon={icon} size={labelIconSize[size]} />}
      {children}
      <input
        type="file"
        className={styles.fileInput}
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Reset so picking the same file again still fires onChange.
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

interface IconButtonOwnProps {
  icon: IconSvgElement;
  /** Required: icon-only controls need an accessible name. Also shown as a tooltip. */
  label: string;
}

export type IconButtonProps = ButtonStyleProps & IconButtonOwnProps & Omit<ComponentProps<"button">, "children"> & { loading?: boolean };

export function IconButton({ variant = "ghost", size = "md", icon, label, loading, disabled, type = "button", className, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size }, true, className)}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : <Icon icon={icon} size={iconOnlySize[size]} />}
    </button>
  );
}

export type IconButtonLinkProps = ButtonStyleProps & IconButtonOwnProps & Omit<ComponentProps<"a">, "href" | "children"> & { to: To; state?: unknown };

export function IconButtonLink({ variant = "ghost", size = "md", icon, label, to, state, className, ...rest }: IconButtonLinkProps) {
  return (
    <Link to={to} state={state} className={buttonClassName({ variant, size }, true, className)} aria-label={label} title={label} {...rest}>
      <Icon icon={icon} size={iconOnlySize[size]} />
    </Link>
  );
}
