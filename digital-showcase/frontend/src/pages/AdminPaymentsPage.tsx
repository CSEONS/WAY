import { Money03Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AcceptPaymentModal } from "../components/admin/AcceptPaymentModal";
import type { MonthRevenue, Payment, PaymentMethod, Store } from "../types/models";
import { formatDate, formatMoney, formatMonthShort, plural } from "../utils/format";
import { Button, Card, CardHeader, ConfirmModal, EmptyState, ErrorState, Field, LoadingState, Page, PageHeader, Select, useToast } from "../ui";
import styles from "./AdminPaymentsPage.module.css";

const methodLabels: Record<PaymentMethod, string> = { CASH: "наличные", TRANSFER: "перевод", OTHER: "другое" };

/** Money received: by month and every payment, with «Принять оплату» and cancelling a mistake. */
export function AdminPaymentsPage() {
  const toast = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [byMonth, setByMonth] = useState<MonthRevenue[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [storeId, setStoreId] = useState("");
  const [payStore, setPayStore] = useState<Store | null>(null);
  const [toCancel, setToCancel] = useState<Payment | null>(null);

  function load() {
    Promise.all([api.get<{ payments: Payment[]; byMonth: MonthRevenue[] }>("/admin/payments"), api.get<Store[]>("/admin/stores")])
      .then(([paymentsRes, storesRes]) => {
        setPayments(paymentsRes.data.payments);
        setByMonth(paymentsRes.data.byMonth);
        setStores(storesRes.data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  async function cancel() {
    if (!toCancel) return;
    try {
      const { data } = await api.delete<{ rolledBack: boolean }>(`/admin/payments/${toCancel.id}`);
      toast.show(data.rolledBack ? "Оплата отменена, дата подписки возвращена" : "Оплата удалена. Дату подписки проверьте в магазине", { tone: "success" });
      load();
    } catch (err: any) {
      toast.show(err?.response?.data?.message ?? "Не удалось отменить оплату", { tone: "danger" });
    } finally {
      setToCancel(null);
    }
  }

  // Months before the first payment are just empty rows.
  const firstPaid = byMonth.findIndex((month) => month.total > 0);
  const chartMonths = firstPaid < 0 ? byMonth.slice(-1) : byMonth.slice(firstPaid);
  const maxTotal = Math.max(1, ...chartMonths.map((month) => month.total));
  const yearTotal = byMonth.reduce((sum, month) => sum + month.total, 0);

  return (
    <Page>
      <PageHeader title="Оплаты" description={state === "ready" ? `За 12 месяцев: ${formatMoney(yearTotal)}` : undefined} back={{ to: "/admin", label: "В админку" }} />
      {state === "error" ? (
        <ErrorState onRetry={load} />
      ) : state === "loading" ? (
        <LoadingState />
      ) : (
        <>
          <Card as="section" padding="lg" className={styles.accept}>
            <Field label="Принять оплату от магазина" className={styles.storeField}>
              <Select
                placeholder="Выберите магазин"
                value={storeId}
                onChange={setStoreId}
                options={stores.map((store) => ({ value: store.id, label: `${store.name} (${store.ownerName ?? ""})` }))}
              />
            </Field>
            <Button variant="primary" icon={Money03Icon} disabled={!storeId} onClick={() => setPayStore(stores.find((store) => store.id === storeId) ?? null)}>
              Принять оплату
            </Button>
          </Card>

          <Card as="section" padding="lg">
            <CardHeader title="Выручка по месяцам" />
            <div className={styles.chart}>
              {chartMonths.map((month) => (
                <div key={month.month} className={styles.bar}>
                  <span className={styles.barMonth}>{formatMonthShort(month.month)}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${(month.total / maxTotal) * 100}%` }} />
                  </span>
                  <span className={styles.barValue}>
                    {formatMoney(month.total)}
                    {month.count > 0 && <small> · {month.count} {plural(month.count, ["оплата", "оплаты", "оплат"])}</small>}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card as="section" padding="lg">
            <CardHeader title="Все оплаты" />
            {payments.length ? (
              <div className={styles.list}>
                {payments.map((payment) => (
                  <div key={payment.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <strong>{payment.amount ? formatMoney(payment.amount) : "Бесплатно"}</strong>
                      <span>
                        {payment.storeName} · {payment.months} мес. · {methodLabels[payment.method]}
                      </span>
                      {payment.comment && <small>{payment.comment}</small>}
                    </div>
                    <div className={styles.rowMeta}>
                      <span>{formatDate(payment.createdAt)}</span>
                      <small>оплачено до {formatDate(payment.periodEnd)}</small>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setToCancel(payment)}>
                      Отменить
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Money03Icon} title="Оплат пока нет" description="Нажмите «Принять оплату», когда магазин заплатит за подписку." />
            )}
          </Card>
        </>
      )}

      {payStore && (
        <AcceptPaymentModal
          store={payStore}
          onClose={() => setPayStore(null)}
          onPaid={() => {
            setPayStore(null);
            setStoreId("");
            load();
          }}
        />
      )}
      {toCancel && (
        <ConfirmModal
          title="Отменить оплату?"
          description={`${toCancel.amount ? formatMoney(toCancel.amount) : "Бесплатное продление"} от ${formatDate(toCancel.createdAt)}, ${toCancel.storeName}. Если это последнее продление магазина, подписка вернётся к ${toCancel.periodStart ? formatDate(toCancel.periodStart) : "прежней дате"}.`}
          confirmLabel="Отменить оплату"
          cancelLabel="Не отменять"
          danger
          onConfirm={cancel}
          onCancel={() => setToCancel(null)}
        />
      )}
    </Page>
  );
}
