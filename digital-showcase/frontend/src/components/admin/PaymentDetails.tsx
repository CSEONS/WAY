import type { PaymentMethod } from "../../types/models";
import { Field, Input, SegmentedControl } from "../../ui";
import styles from "./AcceptPaymentModal.module.css";

const methodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Наличные" },
  { value: "TRANSFER", label: "Перевод" },
  { value: "OTHER", label: "Другое" }
];

export interface PaymentDetailsValue {
  method: PaymentMethod;
  receipt: string;
  comment: string;
}

export const emptyPaymentDetails: PaymentDetailsValue = { method: "CASH", receipt: "", comment: "" };

/** «Продлить» and «Пакет» after the sum: how it was paid (one tap), the receipt, a note for the admin. */
export function PaymentDetails({ value, onChange }: { value: PaymentDetailsValue; onChange: (value: PaymentDetailsValue) => void }) {
  return (
    <>
      <div className={styles.group}>
        <span className={styles.label}>Способ</span>
        <SegmentedControl
          label="Способ оплаты"
          value={value.method}
          onChange={(method) => onChange({ ...value, method })}
          options={methodOptions}
          className={styles.fill}
        />
      </div>
      <Field label="Чек" hint="Ссылка или номер чека из «Мой налог». Можно добавить позже в «Оплатах».">
        <Input value={value.receipt} onChange={(e) => onChange({ ...value, receipt: e.target.value })} placeholder="https://lknpd.nalog.ru/…" />
      </Field>
      <Field label="Комментарий">
        <Input value={value.comment} onChange={(e) => onChange({ ...value, comment: e.target.value })} placeholder="Видно только в админке" />
      </Field>
    </>
  );
}
