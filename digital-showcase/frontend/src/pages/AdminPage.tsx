import { ArrowRight01Icon, InboxIcon, Store01Icon, UserAccountIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Lead } from "../types/models";
import { plural } from "../utils/format";
import { Badge, Card, CardHeader, Icon, Page, PageHeader } from "../ui";
import styles from "./AdminPage.module.css";

const sections = [
  { to: "/admin/owners", label: "Владельцы", icon: UserAccountIcon },
  { to: "/admin/stores", label: "Магазины", icon: Store01Icon },
  { to: "/admin/leads", label: "Заявки с сайта", icon: InboxIcon }
];

export function AdminPage() {
  const [newLeads, setNewLeads] = useState(0);

  useEffect(() => {
    api
      .get<Lead[]>("/admin/leads")
      .then((res) => setNewLeads(res.data.filter((lead) => lead.status === "NEW").length))
      .catch(() => undefined);
  }, []);

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
              <span className={styles.tileLabel}>
                {section.to === "/admin/leads" && newLeads > 0 && <Badge tone="accent">{`${newLeads} ${plural(newLeads, ["новая", "новые", "новых"])}`}</Badge>}
                <Icon icon={ArrowRight01Icon} size="sm" />
              </span>
            </Link>
          ))}
        </nav>
      </Card>
    </Page>
  );
}
