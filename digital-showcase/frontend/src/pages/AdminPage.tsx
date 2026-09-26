import { ArrowRight01Icon, Store01Icon, UserAccountIcon } from "@hugeicons/core-free-icons";
import { Link } from "react-router-dom";
import { Card, CardHeader, Icon, Page, PageHeader } from "../ui";
import styles from "./AdminPage.module.css";

const sections = [
  { to: "/admin/owners", label: "Владельцы", icon: UserAccountIcon },
  { to: "/admin/stores", label: "Магазины", icon: Store01Icon }
];

export function AdminPage() {
  return (
    <Page>
      <PageHeader title="Админ-панель" />
      <Card as="section" padding="lg">
        <CardHeader title="Разделы" />
        <nav className={styles.tiles} aria-label="Разделы админки">
          {sections.map((section) => (
            <Link key={section.to} to={section.to} className={styles.tile}>
              <span className={styles.tileLabel}>
                <Icon icon={section.icon} size="md" />
                {section.label}
              </span>
              <Icon icon={ArrowRight01Icon} size="sm" />
            </Link>
          ))}
        </nav>
      </Card>
    </Page>
  );
}
