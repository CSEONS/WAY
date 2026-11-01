import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { useAdminPlans } from "../../state/adminPlans";
import type { Store, SubscriptionInfo } from "../../types/models";
import { formatDate, formatMoney } from "../../utils/format";
import { Button, Field, Input, Modal, SegmentedControl, useToast } from "../../ui";
import styles from "./AcceptPaymentModal.module.css";
import { emptyPaymentDetails, PaymentDetails } from "./PaymentDetails";

const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const periods = ["1", "3", "6", "12"] as const;
type Period = (typeof periods)[number];

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
  /** planId: its price × the period is suggested as the sum. */
  store: { id: string; name: string; subscriptionEndsAt: string | null; subscription?: SubscriptionInfo; planId?: string | null };
  onClose: () => void;
  onPaid: (store: Store) => void;
}

/**
 * «Продлить»: extends the subscription and records the payment in one step
 * (0 ₽ — a free extension). The period first: the sum follows it from the
 * plan's price until the admin types another.
 */
export function AcceptPaymentModal({ store, onClose, onPaid }: AcceptPaymentModalProps) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [period, setPeriod] = useState<Period>("1");
  const [details, setDetails] = useState(emptyPaymentDetails);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const months = Number(period);
  const endsAt = previewEnd(store.subscriptionEndsAt, months);
  const { plans } = useAdminPlans();
  const plan = plans?.find((item) => item.id === store.planId) ?? null;
  const shownAmount = !amountTouched && plan?.price != null ? String(plan.price * months) : amount;
  const isRunning = Boolean(store.subscriptionEndsAt && Date.parse(store.subscriptionEndsAt) > Date.now());

  async function submit(event: FormEvent) {
    event.preventDefault();
    const rubles = shownAmount.trim() === "" ? NaN : Number(shownAmount.replace(/\s/g, ""));
    if (!Number.isInteger(rubles) || rubles < 0) {
      setError("Сумма в рублях, целым числом. 0 — продлить бесплатно.");
      return;
    }
    setIsSaving(true);
    try {
      const { data } = await api.post<{ store: Store }>(`/admin/stores/${store.id}/payments`, { amount: rubles, months, ...details });
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
      <div className={styles.group}>
        <span className={styles.label}>На сколько</span>
        <SegmentedControl
          label="На сколько продлить"
          value={period}
          onChange={setPeriod}
          options={periods.map((value) => ({ value, label: `${value} мес.` }))}
          className={styles.fill}
        />
      </div>
      <Field
        label="Сумма, ₽"
        hint={
          plan?.price != null
            ? `${formatMoney(plan.price)} × ${months} мес. по тарифу «${plan.name}». 0 — продлить бесплатно.`
            : "0 — продлить бесплатно."
        }
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
      <PaymentDetails value={details} onChange={setDetails} />
      <p className={styles.preview}>
        Будет оплачено до <strong>{formatDate(endsAt)}</strong>
        {isRunning && ` — сейчас до ${formatDate(store.subscriptionEndsAt)}`}
      </p>
    </Modal>
  );
}
