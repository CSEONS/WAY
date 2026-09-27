import { Note01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AuditEntry } from "../types/models";
import { Badge, Card, EmptyState, ErrorState, LoadingState, Page, PageHeader, type Tone } from "../ui";
import styles from "./AdminJournalPage.module.css";

const actions: Record<string, { label: string; tone: Tone }> = {
  STORE_CONNECTED: { label: "Подключён магазин", tone: "success" },
  PAYMENT_ACCEPTED: { label: "Принята оплата", tone: "success" },
  PAYMENT_CANCELLED: { label: "Отменена оплата", tone: "warning" },
  SUBSCRIPTION_CHANGED: { label: "Изменена дата подписки", tone: "warning" },
  PLAN_CHANGED: { label: "Изменён тариф", tone: "accent" },
  IMPERSONATION_STARTED: { label: "Вход от имени владельца", tone: "danger" },
  ACTION_AS_OWNER: { label: "Действие от имени владельца", tone: "danger" },
  OWNER_PASSWORD_SET: { label: "Задан пароль владельцу", tone: "neutral" },
  OWNER_DELETED: { label: "Удалён владелец", tone: "danger" },
  STORE_DELETED: { label: "Удалён магазин", tone: "danger" }
};

const timeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Who did what and when: payments, plan changes, signing in as an owner and everything done there. */
export function AdminJournalPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  function load() {
    setState("loading");
    api
      .get<AuditEntry[]>("/admin/journal")
      .then((res) => {
        setEntries(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  return (
    <Page>
      <PageHeader title="Журнал действий" description="Последние 200 записей" back={{ to: "/admin", label: "В админку" }} />
      {state === "error" ? (
        <ErrorState onRetry={load} />
      ) : state === "loading" ? (
        <LoadingState />
      ) : entries.length ? (
        <Card padding="none" className={styles.list}>
          {entries.map((entry) => {
            const action = actions[entry.action] ?? { label: entry.action, tone: "neutral" as Tone };
            return (
              <div key={entry.id} className={styles.entry}>
                <time className={styles.time} dateTime={entry.createdAt}>
                  {timeFormat.format(new Date(entry.createdAt))}
                </time>
                <div className={styles.body}>
                  <div className={styles.title}>
                    <Badge tone={action.tone}>{action.label}</Badge>
                    {entry.targetName && <strong>{entry.targetName}</strong>}
                  </div>
                  {entry.details && <p className={styles.details}>{entry.details}</p>}
                  <small className={styles.actor}>{entry.actorName}</small>
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState icon={Note01Icon} title="Записей пока нет" description="Здесь появятся оплаты, смена тарифов и входы от имени владельцев." />
      )}
    </Page>
  );
}
