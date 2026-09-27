import { Call02Icon, CheckmarkCircle02Icon, InboxIcon, PlusSignIcon, RefreshIcon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Lead, LeadStatus } from "../types/models";
import { plural } from "../utils/format";
import { phoneUrl, whatsappUrl } from "../utils/contact";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, LoadingState, Page, PageHeader, SegmentedControl, useToast } from "../ui";
import styles from "./AdminLeadsPage.module.css";

type Filter = "NEW" | "all";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Requests from the landing page form: call back, then mark as done. */
export function AdminLeadsPage() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<Filter>("NEW");
  const [savingId, setSavingId] = useState("");

  function load() {
    setState("loading");
    api
      .get<Lead[]>("/admin/leads")
      .then((res) => {
        setLeads(res.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  async function setStatus(lead: Lead, status: LeadStatus) {
    setSavingId(lead.id);
    try {
      const { data } = await api.patch<Lead>(`/admin/leads/${lead.id}`, { status });
      setLeads((current) => current.map((item) => (item.id === data.id ? data : item)));
      toast.show(status === "DONE" ? "Заявка обработана" : "Заявка снова в новых");
    } catch {
      toast.show("Не удалось сохранить. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setSavingId("");
    }
  }

  const newCount = leads.filter((lead) => lead.status === "NEW").length;
  const shown = filter === "NEW" ? leads.filter((lead) => lead.status === "NEW") : leads;

  return (
    <Page>
      <PageHeader
        title="Заявки с сайта"
        description={state === "ready" ? `${newCount} ${plural(newCount, ["новая заявка", "новые заявки", "новых заявок"])}` : undefined}
        back={{ to: "/admin", label: "Назад в админку" }}
        actions={
          <Button variant="ghost" icon={RefreshIcon} onClick={load}>
            Обновить
          </Button>
        }
      />
      <SegmentedControl
        label="Какие заявки показывать"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "NEW", label: `Новые${newCount ? ` · ${newCount}` : ""}` },
          { value: "all", label: "Все" }
        ]}
      />
      {state === "loading" && !leads.length ? (
        <LoadingState />
      ) : state === "error" ? (
        <ErrorState onRetry={load} />
      ) : shown.length ? (
        <div className={styles.list}>
          {shown.map((lead) => (
            <Card key={lead.id} padding="lg" className={styles.lead}>
              <div className={styles.head}>
                <div className={styles.who}>
                  <strong className={styles.name}>{lead.name}</strong>
                  <span className={styles.meta}>
                    {[lead.storeName, lead.city].filter(Boolean).join(" · ") || "Магазин не указан"}
                  </span>
                </div>
                {lead.status === "NEW" ? <Badge tone="accent">Новая</Badge> : <Badge tone="success">Обработана</Badge>}
              </div>
              <a className={styles.phone} href={phoneUrl(lead.phone)}>
                {lead.phone}
              </a>
              {lead.comment && <p className={styles.comment}>{lead.comment}</p>}
              <small className={styles.date}>{dateFormat.format(new Date(lead.createdAt))}</small>
              <div className={styles.actions}>
                <ButtonLink variant="primary" icon={Call02Icon} href={phoneUrl(lead.phone)}>
                  Позвонить
                </ButtonLink>
                <ButtonLink variant="outline" icon={WhatsappIcon} href={whatsappUrl(lead.phone, `Здравствуйте, ${lead.name}! Вы оставили заявку на подключение витрины.`)} target="_blank" rel="noreferrer">
                  WhatsApp
                </ButtonLink>
                {lead.status === "NEW" && (
                  <ButtonLink variant="outline" icon={PlusSignIcon} to={`/admin/connect?lead=${lead.id}`}>
                    Подключить
                  </ButtonLink>
                )}
                {lead.status === "NEW" ? (
                  <Button variant="secondary" icon={CheckmarkCircle02Icon} loading={savingId === lead.id} onClick={() => setStatus(lead, "DONE")} className={styles.pushRight}>
                    Обработана
                  </Button>
                ) : (
                  <Button variant="ghost" loading={savingId === lead.id} onClick={() => setStatus(lead, "NEW")} className={styles.pushRight}>
                    Вернуть в новые
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={InboxIcon}
          title={filter === "NEW" ? "Новых заявок нет" : "Заявок пока нет"}
          description="Заявки приходят с формы «Подключим ваш магазин» на главной странице."
        />
      )}
    </Page>
  );
}
