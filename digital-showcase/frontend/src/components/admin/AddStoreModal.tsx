import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { planLabel, useAdminPlans } from "../../state/adminPlans";
import type { Store, User } from "../../types/models";
import { Button, Field, Input, Modal, Select } from "../../ui";

type SlugState = { status: "idle" | "checking" | "ok" | "taken"; message?: string };

/**
 * «Ещё магазин»: one more store for an owner who already has an account.
 * It starts on the trial, like «Подключить магазин»; paid time is added with
 * «Продлить», so the money is recorded. The plan is the owner's other
 * store's until the admin picks another.
 */
export function AddStoreModal({ owners, stores, onClose, onCreated }: { owners: User[]; stores: Store[]; onClose: () => void; onCreated: () => void }) {
  const { plans } = useAdminPlans();
  const [ownerId, setOwnerId] = useState("");
  const [chosenPlanId, setChosenPlanId] = useState("");
  // The owner's first store: the one they pay for longest.
  const ownersPlanId = stores
    .filter((store) => store.ownerId === ownerId && plans?.some((plan) => plan.id === store.planId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.planId;
  const planId = chosenPlanId || ownersPlanId || plans?.find((plan) => plan.isPublic)?.id || plans?.[0]?.id || "";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugState, setSlugState] = useState<SlugState>({ status: "idle" });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // Until the admin edits the address, it follows the store name.
  const slugTouched = useRef(false);

  // A free address for the store name.
  useEffect(() => {
    if (slugTouched.current || !name.trim()) return;
    const timer = window.setTimeout(() => {
      api
        .get<{ slug: string }>("/admin/slug", { params: { name } })
        .then((res) => {
          if (slugTouched.current) return;
          setSlug(res.data.slug);
          setSlugState({ status: "ok" });
        })
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name]);

  // An address typed by hand: is it free?
  useEffect(() => {
    if (!slugTouched.current || !slug) return;
    setSlugState({ status: "checking" });
    const timer = window.setTimeout(() => {
      api
        .get<{ available: boolean; message?: string }>("/admin/slug", { params: { slug } })
        .then((res) => setSlugState(res.data.available ? { status: "ok" } : { status: "taken", message: res.data.message }))
        .catch(() => setSlugState({ status: "idle" }));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [slug]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ownerId) {
      setError("Выберите владельца");
      return;
    }
    setIsSaving(true);
    try {
      await api.post("/admin/stores", { ownerId, name, slug, isActive: 1, ...(planId ? { planId } : {}) });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось создать магазин");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      title="Ещё один магазин владельцу"
      description="Начнётся с пробного периода. Оплаченное время добавьте потом кнопкой «Продлить»."
      onClose={onClose}
      closeOnBackdrop={false}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={isSaving} disabled={slugState.status === "taken"}>
            Создать
          </Button>
        </>
      }
    >
      <Field label="Владелец" error={error} required>
        <Select
          placeholder={owners.length ? "Выберите" : "Владельцев нет — «Подключить магазин»"}
          value={ownerId}
          onChange={(value) => {
            setOwnerId(value);
            setError("");
          }}
          options={owners.map((owner) => ({ value: owner.id, label: [owner.name, owner.phone || owner.email].filter(Boolean).join(" · ") }))}
        />
      </Field>
      <Field label="Название" required>
        <Input autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label="Адрес витрины"
        required
        error={slugState.status === "taken" ? slugState.message : undefined}
        hint={slug ? `${window.location.host}/m/${slug}` : "Заполнится по названию"}
      >
        <Input
          autoComplete="off"
          required
          value={slug}
          onChange={(e) => {
            slugTouched.current = true;
            setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
          }}
        />
      </Field>
      {plans && plans.length > 0 && (
        <Field label="Тариф" hint={ownersPlanId && planId === ownersPlanId ? "Как у другого магазина этого владельца" : undefined}>
          <Select value={planId} onChange={setChosenPlanId} options={plans.map((plan) => ({ value: plan.id, label: planLabel(plan) }))} />
        </Field>
      )}
    </Modal>
  );
}
