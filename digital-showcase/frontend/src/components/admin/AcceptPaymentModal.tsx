import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import type { PaymentMethod, Store, SubscriptionInfo } from "../../types/models";
import { formatDate, formatMoney } from "../../utils/format";
import { Button, Field, Input, Modal, SegmentedControl, Select, Textarea, useToast } from "../../ui";
import styles from "./AcceptPaymentModal.module.css";

const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const periods = ["1", "3", "6", "12"] as const;
type Period = (typeof periods)[number];

const methodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Наличные" },
  { value: "TRANSFER", label: "Перевод" },
  { value: "OTHER", label: "Другое" }
];

/** Same rule as the server: from the old date while the store still runs (grace included), otherwise from today. */
function previewEnd(endsAt: string | null | undefined, months: number) {
  const endsAtMs = endsAt ? Date.parse(endsAt) : NaN;
  const base = !Number.isNaN(endsAtMs) && endsAtMs + GRACE_DAYS * DAY_MS >= Date.now() ? new Date(endsAtMs) : new Date();
  const day = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + months);
  base.setDate(Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  return base.toISOString();
}

interface AcceptPaymentModalProps {
  store: { id: string; name: string; subscriptionEndsAt: string | null; subscription?: SubscriptionInfo };
  onClose: () => void;
  onPaid: (store: Store) => void;
}

/** «Принять оплату»: records the money and extends the subscription in one step. */
export function AcceptPaymentModal({ store, onClose, onPaid }: AcceptPaymentModalProps) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<Period>("1");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [comment, setComment] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const months = Number(period);
  const endsAt = previewEnd(store.subscriptionEndsAt, months);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const rubles = amount.trim() === "" ? NaN : Number(amount.replace(/\s/g, ""));
    if (!Number.isInteger(rubles) || rubles < 0) {
      setError("Сумма в рублях, целым числом. 0 — продлить бесплатно.");
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await api.post<{ store: Store }>(`/admin/stores/${store.id}/payments`, { amount: rubles, months, method, comment, receipt });
      toast.show(`${formatMoney(rubles)} принято. Оплачено до ${formatDate(data.store.subscriptionEndsAt)}`, { tone: "success" });
      onPaid(data.store);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить оплату");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="Принять оплату"
      description={store.name}
      onClose={onClose}
      closeOnBackdrop={false}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={isSaving}>
            Принять
          </Button>
        </>
      }
    >
      <Field label="Сумма, ₽" error={error} required>
        <Input
          inputMode="numeric"
          placeholder="1500"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setError("");
          }}
        />
      </Field>
      <div className={styles.row}>
        <div className={styles.period}>
          <span className={styles.label}>Период</span>
          <SegmentedControl
            label="Период оплаты"
            value={period}
            onChange={setPeriod}
            options={periods.map((value) => ({ value, label: `${value} мес.` }))}
          />
        </div>
        <Field label="Способ">
          <Select value={method} onChange={(value) => setMethod(value as PaymentMethod)} options={methodOptions} />
        </Field>
      </div>
      <Field label="Чек" hint="Ссылка на чек из «Мой налог» или номер чека. Можно добавить позже в «Оплатах». Владелец увидит его в своей истории оплат.">
        <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="https://lknpd.nalog.ru/…" />
      </Field>
      <Field label="Комментарий" hint="Видно только в админке">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <p className={styles.preview}>
        Подписка будет оплачена до <strong>{formatDate(endsAt)}</strong>
        {store.subscriptionEndsAt && Date.parse(store.subscriptionEndsAt) > Date.now() && ` (сейчас до ${formatDate(store.subscriptionEndsAt)})`}
      </p>
    </Modal>
  );
}
