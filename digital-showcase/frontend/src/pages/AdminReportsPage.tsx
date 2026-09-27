import { Copy01Icon, Invoice01Icon, WhatsappIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { MonthReport, SubscriptionInfo } from "../types/models";
import { whatsappUrl } from "../utils/contact";
import { formatMonth } from "../utils/format";
import { reportMessage } from "../utils/report";
import { Button, ButtonLink, Card, EmptyState, ErrorState, LoadingState, Page, PageHeader, SegmentedControl, useCopyToClipboard } from "../ui";
import styles from "./AdminReportsPage.module.css";

interface StoreReport {
  store: { id: string; name: string; slug: string; whatsapp: string | null; subscription: SubscriptionInfo };
  owner: { id: string; name: string; phone: string | null };
  report: MonthReport;
}

interface ReportsResponse {
  month: string;
  months: string[];
  reports: StoreReport[];
}

/** The best argument to renew: «витрину посмотрели 340 раз, 25 человек написали» — sent to each owner in WhatsApp. */
export function AdminReportsPage() {
  const copy = useCopyToClipboard();
  const [data, setData] = useState<ReportsResponse>();
  const [month, setMonth] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  function load(selected = month) {
    setState("loading");
    api
      .get<ReportsResponse>("/admin/reports", { params: selected ? { month: selected } : {} })
      .then((res) => {
        setData(res.data);
        setMonth(res.data.month);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(() => load(), []);

  // The previous month is the one to send at the start of a month.
  const monthOptions = (data?.months ?? []).slice(0, 4).reverse().map((value) => ({ value, label: formatMonth(value) }));

  return (
    <Page>
      <PageHeader
        title="Отчёты владельцам"
        description="Итоги месяца по каждой витрине. Отправьте их владельцам в начале месяца — это лучший повод продлить подписку."
        back={{ to: "/admin", label: "В админку" }}
      />
      {monthOptions.length > 0 && (
        <SegmentedControl
          label="Месяц"
          value={month}
          onChange={(value) => {
            setMonth(value);
            load(value);
          }}
          options={monthOptions}
        />
      )}
      {state === "error" ? (
        <ErrorState onRetry={() => load()} />
      ) : state === "loading" && !data ? (
        <LoadingState />
      ) : data?.reports.length ? (
        <div className={styles.list}>
          {data.reports.map(({ store, owner, report }) => {
            const message = reportMessage({ ownerName: owner.name, storeName: store.name, report, subscription: store.subscription });
            const phone = owner.phone || store.whatsapp;
            return (
              <Card key={store.id} padding="lg" className={styles.report}>
                <div className={styles.head}>
                  <div>
                    <strong>{store.name}</strong>
                    <small>{owner.name}</small>
                  </div>
                  <div className={styles.numbers}>
                    <span>
                      <b>{report.storeViews}</b> просмотров
                    </span>
                    <span>
                      <b>{report.contactClicks}</b> обращений
                    </span>
                  </div>
                </div>
                <pre className={styles.message}>{message}</pre>
                <div className={styles.actions}>
                  {phone && (
                    <ButtonLink variant="primary" size="sm" icon={WhatsappIcon} href={whatsappUrl(phone, message)} target="_blank" rel="noreferrer">
                      Отправить в WhatsApp
                    </ButtonLink>
                  )}
                  <Button variant="secondary" size="sm" icon={Copy01Icon} onClick={() => copy(message, "Отчёт скопирован")}>
                    Скопировать
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Invoice01Icon}
          title={month ? `За ${formatMonth(month)} отчётов нет` : "Отчётов пока нет"}
          description="Отчёт появляется у магазинов, которые уже работали в этом месяце. Выберите месяц выше."
        />
      )}
    </Page>
  );
}
