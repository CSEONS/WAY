import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { useAdminPackages } from "../../state/adminPackages";
import type { PackageOrder, PaymentMethod } from "../../types/models";
import { formatMoney } from "../../utils/format";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "../../ui";
import { packageSummary } from "../landing/PackageCard";
// The same form as «Продлить»: sum, method, receipt, comment.
import styles from "./AcceptPaymentModal.module.css";

const methodOptions: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Наличные" },
  { value: "TRANSFER", label: "Перевод" },
  { value: "OTHER", label: "Другое" }
];

interface SellPackageModalProps {
  /** extraPreviews/extraFills: what the store has left, shown for reference. */
  store: { id: string; name: string; extraPreviews?: number; extraFills?: number };
  /** The owner's request being paid: its package is fixed. Without it the admin picks one. */
  order?: Pick<PackageOrder, "id" | "name" | "price" | "previews" | "fills" | "isService">;
  onClose: () => void;
  onSold: () => void;
}

/** «Продать пакет»: the money is recorded like any payment, the store gets what's in the package at once. */
export function SellPackageModal({ store, order, onClose, onSold }: SellPackageModalProps) {
  const toast = useToast();
  const { packages } = useAdminPackages();
  const [packageId, setPackageId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [comment, setComment] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const picked = order ?? packages?.find((item) => item.id === packageId) ?? null;
  // The package's price until the admin types another sum.
  const shownAmount = !amountTouched && picked ? String(picked.price) : amount;
  const left = [store.extraPreviews ? `${store.extraPreviews} превью` : "", store.extraFills ? `${store.extraFills} карточек` : ""].filter(Boolean).join(" и ");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked) {
      setError("Выберите пакет");
      return;
    }
    const rubles = shownAmount.trim() === "" ? NaN : Number(shownAmount.replace(/\s/g, ""));
    if (!Number.isInteger(rubles) || rubles < 0) {
      setError("Сумма в рублях, целым числом. 0 — в подарок.");
      return;
    }
    setIsSaving(true);
    try {
      await api.post(`/admin/stores/${store.id}/packages`, { ...(order ? { orderId: order.id } : { packageId }), amount: rubles, method, comment, receipt });
      toast.show(`«${picked.name}» — ${store.name} · ${formatMoney(rubles)}`, { tone: "success" });
      onSold();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось оформить пакет");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title={order ? `Пакет «${order.name}»` : "Продать пакет"}
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
            Оплачено
          </Button>
        </>
      }
    >
      {!order && (
        <Field label="Пакет" required>
          <Select
            value={packageId}
            placeholder={packages === undefined ? "Загружаем…" : packages?.length ? "Выберите пакет" : "Пакетов нет — добавьте в «Тарифах и ценах»"}
            onChange={(value) => {
              setPackageId(value);
              setError("");
            }}
            options={(packages ?? []).map((item) => ({
              value: item.id,
              label: `${item.name} · ${formatMoney(item.price)}${item.isPublic ? "" : " · скрыт"}`
            }))}
          />
        </Field>
      )}
      <div className={styles.row}>
        <Field label="Сумма, ₽" hint={picked ? `Цена пакета — ${formatMoney(picked.price)}` : undefined} error={error} required>
          <Input
            inputMode="numeric"
            placeholder="200"
            value={shownAmount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountTouched(true);
              setError("");
            }}
          />
        </Field>
        <Field label="Способ">
          <Select value={method} onChange={(value) => setMethod(value as PaymentMethod)} options={methodOptions} />
        </Field>
      </div>
      <Field label="Чек" hint="Ссылка на чек из «Мой налог» или номер чека. Можно добавить позже в «Оплатах».">
        <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="https://lknpd.nalog.ru/…" />
      </Field>
      <Field label="Комментарий" hint="Видно только в админке">
        <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      {picked && (
        <p className={styles.preview}>
          {picked.previews || picked.fills ? (
            <>
              Магазину добавится <strong>{packageSummary({ ...picked, isService: false })}</strong>
              {left && ` (сейчас осталось ${left})`}.
            </>
          ) : null}
          {picked.isService ? `${picked.previews || picked.fills ? " " : ""}Услуга появится в «Нужно сделать сейчас», пока вы не нажмёте «Выполнено».` : null}
        </p>
      )}
    </Modal>
  );
}
