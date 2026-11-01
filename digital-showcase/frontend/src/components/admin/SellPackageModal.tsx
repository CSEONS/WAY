import { type FormEvent, useState } from "react";
import { api } from "../../api/client";
import { useAdminPackages } from "../../state/adminPackages";
import type { PackageOrder } from "../../types/models";
import { formatMoney } from "../../utils/format";
import { Button, Field, Input, Modal, useToast } from "../../ui";
import { packageSummary } from "../landing/PackageCard";
// The same form as «Продлить»: what, sum, how paid, what happens.
import styles from "./AcceptPaymentModal.module.css";
import { emptyPaymentDetails, PaymentDetails } from "./PaymentDetails";

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
  const [chosenId, setChosenId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [details, setDetails] = useState(emptyPaymentDetails);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // The only package is picked already.
  const packageId = chosenId || (packages?.length === 1 ? packages[0].id : "");
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
      await api.post(`/admin/stores/${store.id}/packages`, { ...(order ? { orderId: order.id } : { packageId }), amount: rubles, ...details });
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
        <div className={styles.group}>
          <span className={styles.label}>Пакет</span>
          {packages === undefined ? (
            <p className={styles.label}>Загружаем…</p>
          ) : packages?.length ? (
            <fieldset className={styles.packages} aria-label="Пакет">
              {packages.map((item) => (
                <label key={item.id} className={styles.package}>
                  <input
                    type="radio"
                    name="package"
                    value={item.id}
                    checked={item.id === packageId}
                    onChange={() => {
                      setChosenId(item.id);
                      setAmountTouched(false);
                      setError("");
                    }}
                  />
                  <span className={styles.packageName}>
                    {item.name}
                    {/* Owners don't see it in «Подписка», but it can still be sold. */}
                    {!item.isPublic && <small>скрыт от владельцев</small>}
                  </span>
                  <span className={styles.packagePrice}>{item.price ? formatMoney(item.price) : "бесплатно"}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className={styles.label}>Пакетов нет — добавьте их в «Тарифах и ценах».</p>
          )}
        </div>
      )}
      <Field label="Сумма, ₽" hint={picked ? `Цена пакета — ${formatMoney(picked.price)}. 0 — в подарок.` : undefined} error={error} required>
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
      <PaymentDetails value={details} onChange={setDetails} />
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
