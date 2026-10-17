import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { useSiteSettings } from "../../state/siteSettings";
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
  /** aiFormEnabled picks the plan whose price is suggested: «Витрина» or «Витрина + ИИ». */
  store: { id: string; name: string; subscriptionEndsAt: string | null; subscription?: SubscriptionInfo; aiFormEnabled?: number | boolean };
  onClose: () => void;
  onPaid: (store: Store) => void;
}

/** «Продлить»: extends the subscription and records the payment in one step (0 ₽ — a free extension). */
export function AcceptPaymentModal({ store, onClose, onPaid }: AcceptPaymentModalProps) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [period, setPeriod] = useState<Period>("1");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [comment, setComment] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const months = Number(period);
  const endsAt = previewEnd(store.subscriptionEndsAt, months);
  // The plan's price from «Настройки» × the period, until the admin types another sum.
  const site = useSiteSettings();
  const plan = site && store.aiFormEnabled !== undefined ? (store.aiFormEnabled ? site.plans.ai : site.plans.basic) : null;
  const shownAmount = !amountTouched && plan?.price != null ? String(plan.price * months) : amount;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const rubles = shownAmount.trim() === "" ? NaN : Number(shownAmount.replace(/\s/g, ""));
    if (!Number.isInteger(rubles) || rubles < 0) {
      setError("Сумма в рублях, целым числом. 0 — продлить бесплатно.");
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await api.post<{ store: Store }>(`/admin/stores/${store.id}/payments`, { amount: rubles, months, method, comment, receipt });
      toast.show(`Продлено до ${formatDate(data.store.subscriptionEndsAt)} · ${formatMoney(rubles)}`, { tone: "success" });
      onPaid(data.store);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сохранить оплату");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="Продлить подписку"
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
            Продлить
          </Button>
        </>
      }
    >
      <Field
        label="Сумма, ₽"
        hint={plan?.price != null ? `Тариф «${plan.name}» — ${formatMoney(plan.price)} в месяц` : undefined}
        error={error}
        required
      >
        <Input
          inputMode="numeric"
          placeholder="1500"
          value={shownAmount}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountTouched(true);
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
