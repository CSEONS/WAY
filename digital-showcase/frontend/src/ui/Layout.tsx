import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { Link, type To } from "react-router-dom";
import { cx } from "./cx";
import { Icon, type IconSvgElement } from "./Icon";
import styles from "./Layout.module.css";

/** Page container: width, side gutters and vertical rhythm between blocks. */
export function Page({ width = "default", className, children }: { width?: "default" | "narrow"; className?: string; children: ReactNode }) {
  return <section className={cx(styles.page, width === "narrow" && styles.narrow, className)}>{children}</section>;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (under the title on phones). */
  actions?: ReactNode;
  /** Small link above the title. */
  back?: { to: To; label?: string; state?: unknown };
  className?: string;
}

export function PageHeader({ title, description, actions, back, className }: PageHeaderProps) {
  return (
    <div className={cx(styles.header, className)}>
      {back && (
        <BackLink to={back.to} state={back.state}>
          {back.label ?? "Назад"}
        </BackLink>
      )}
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

export function BackLink({ to, state, children = "Назад" }: { to: To; state?: unknown; children?: ReactNode }) {
  return (
    <Link to={to} state={state} className={styles.backLink}>
      <Icon icon={ArrowLeft01Icon} size="sm" />
      {children}
    </Link>
  );
}

export interface BreadcrumbItem {
  label: string;
  to?: To;
  state?: unknown;
  icon?: IconSvgElement;
}

/** The last item is the current page and is not a link. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Навигация" className={styles.breadcrumbs}>
      {items.map((item, index) => {
        const isCurrent = index === items.length - 1;
        const content = (
          <>
            {item.icon && <Icon icon={item.icon} size="sm" />}
            {item.label && <span className={item.icon ? styles.visuallyHidden : undefined}>{item.label}</span>}
          </>
        );
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && <Icon icon={ArrowRight01Icon} size="xs" className={styles.separator} />}
            {isCurrent || !item.to ? (
              <span className={cx(styles.crumb, isCurrent && styles.current)} aria-current={isCurrent ? "page" : undefined}>
                {content}
              </span>
            ) : (
              <Link to={item.to} state={item.state} className={cx(styles.crumb, styles.crumbLink)}>
                {content}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export type CardProps = ComponentProps<"div"> & {
  as?: "div" | "section" | "article" | "aside";
  padding?: "none" | "sm" | "md" | "lg";
  /** outlined — white with a border (default); muted — grey fill, no border. */
  variant?: "outlined" | "muted";
};

export function Card({ as: Tag = "div", padding = "md", variant = "outlined", className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx(styles.card, styles[`padding-${padding}`], styles[variant], className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Title row of a card or form section, with optional buttons on the right. */
export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.cardHeader, className)}>
      <div className={styles.cardHeaderText}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {description && <p className={styles.cardDescription}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

/** Small uppercase caption above a group of controls: «ЦВЕТ», «РАЗМЕР». */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.sectionLabel, className)}>{children}</span>;
}

export function Stat({ icon, label, value }: { icon?: IconSvgElement; label: ReactNode; value: ReactNode }) {
  return (
    <div className={styles.stat}>
      {icon && (
        <span className={styles.statIcon}>
          <Icon icon={icon} size="sm" />
        </span>
      )}
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
    </div>
  );
}
