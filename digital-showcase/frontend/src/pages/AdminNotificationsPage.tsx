import { SentIcon } from "@hugeicons/core-free-icons";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminNotificationBatch, Store } from "../types/models";
import { plural } from "../utils/format";
import { Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, LoadingState, Page, PageHeader, Select, Textarea, useToast } from "../ui";
import styles from "./AdminNotificationsPage.module.css";

const ALL = "all";
const timeFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * «Уведомления»: a message to one store's owner or to every owner. It lands
 * in the bell in their app. Below — what was sent and how many have read it.
 */
export function AdminNotificationsPage() {
  const toast = useToast();
  const [stores, setStores] = useState<Store[]>([]);
  const [history, setHistory] = useState<AdminNotificationBatch[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [target, setTarget] = useState(ALL);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  function load() {
    setState("loading");
    Promise.all([api.get<Store[]>("/admin/stores"), api.get<AdminNotificationBatch[]>("/admin/notifications")])
      .then(([storesRes, historyRes]) => {
        setStores(storesRes.data);
        setHistory(historyRes.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    setIsSending(true);
    try {
      const { data } = await api.post<{ sent: number }>("/admin/notifications", { storeId: target === ALL ? null : target, title, body });
      toast.show(`Отправлено: ${data.sent} ${plural(data.sent, ["владельцу", "владельцам", "владельцам"])}`, { tone: "success" });
      setTitle("");
      setBody("");
      const historyRes = await api.get<AdminNotificationBatch[]>("/admin/notifications");
      setHistory(historyRes.data);
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось отправить. Попробуйте ещё раз.", { tone: "danger" });
    } finally {
      setIsSending(false);
    }
  }

  const options = [
    { value: ALL, label: "Всем владельцам" },
    ...stores.map((store) => ({ value: store.id, label: store.ownerName ? `${store.name} — ${store.ownerName}` : store.name }))
  ];

  return (
    <Page width="narrow">
      <PageHeader
        title="Уведомления"
        description="Сообщение придёт владельцам в колокольчик в их кабинете"
        back={{ to: "/admin", label: "В админку" }}
      />
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "loading" && <LoadingState />}
      {state === "ready" && (
        <>
          <Card as="section" padding="lg">
            <form className={styles.form} onSubmit={send}>
              <Field label="Кому">
                <Select value={target} onChange={setTarget} options={options} />
              </Field>
              <Field label="Заголовок" required>
                <Input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Например, Новая функция в кабинете" required />
              </Field>
              <Field label="Текст" required>
                <Textarea value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} placeholder="Что владельцу важно знать или сделать" required />
              </Field>
              <Button type="submit" variant="primary" icon={SentIcon} loading={isSending} disabled={!title.trim() || !body.trim()}>
                Отправить
              </Button>
            </form>
          </Card>

          <Card as="section" padding="lg">
            <CardHeader title="Отправленные" description="Последние 30 сообщений" />
            {history.length ? (
              <ul className={styles.history}>
                {history.map((row) => (
                  <li key={row.batchId} className={styles.row}>
                    <div className={styles.rowHead}>
                      <strong>{row.title}</strong>
                      <span>{timeFormat.format(new Date(row.createdAt))}</span>
                    </div>
                    <p className={styles.body}>{row.body}</p>
                    <small className={styles.meta}>
                      {row.storeName ? `Магазин «${row.storeName}»` : `Всем владельцам (${row.recipients})`} · прочитали {row.read} из {row.recipients}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Пока ничего не отправлено" />
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
