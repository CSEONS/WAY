import {
  ArchiveArrowDownIcon,
  ArchiveArrowUpIcon,
  Delete02Icon,
  Edit02Icon,
  Money03Icon,
  PlusSignIcon,
  Search01Icon,
  ShoppingBasketAdd01Icon,
  Store01Icon,
  StoreAdd01Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { AcceptPaymentModal } from "../components/admin/AcceptPaymentModal";
import { AddStoreModal } from "../components/admin/AddStoreModal";
import { SellPackageModal } from "../components/admin/SellPackageModal";
import { planLabel, useAdminPlans } from "../state/adminPlans";
import type { Store, User } from "../types/models";
import { subscriptionBadge } from "../utils/subscription";
import { Badge, Button, ButtonLink, Card, CardHeader, ConfirmModal, EmptyState, Field, Icon, Input, Menu, Modal, Page, PageHeader, Select, Textarea, useToast } from "../ui";
import styles from "./AdminStoresPage.module.css";

/** A search box once the list is longer than this. */
const SEARCH_FROM = 6;

interface StoreFormState {
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  workingHours: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  instagram: string;
  vk: string;
  subscriptionEndsAt: string;
  /** Empty — the first plan (the server's default). */
  planId: string;
  /** Empty — the plan's limit. */
  aiMonthlyLimit: string;
}

const emptyStoreForm: StoreFormState = {
  ownerId: "",
  name: "",
  slug: "",
  description: "",
  address: "",
  workingHours: "",
  phone: "",
  whatsapp: "",
  telegram: "",
  instagram: "",
  vk: "",
  subscriptionEndsAt: "",
  planId: "",
  aiMonthlyLimit: ""
};

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function storePayload(form: StoreFormState) {
  return {
    ownerId: form.ownerId,
    name: form.name,
    slug: form.slug,
    description: form.description || null,
    address: form.address || null,
    workingHours: form.workingHours || null,
    phone: form.phone || null,
    whatsapp: form.whatsapp || null,
    telegram: form.telegram || null,
    instagram: form.instagram || null,
    vk: form.vk || null,
    subscriptionEndsAt: toIsoDate(form.subscriptionEndsAt),
    ...(form.planId ? { planId: form.planId } : {}),
    aiMonthlyLimit: form.aiMonthlyLimit.trim() === "" ? null : Number(form.aiMonthlyLimit)
  };
}

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function AdminStoresPage() {
  const toast = useToast();
  const { plans } = useAdminPlans();
  const [owners, setOwners] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState<Store | null>(null);
  const [storeEditForm, setStoreEditForm] = useState<StoreFormState>(emptyStoreForm);
  const editPlan = plans?.find((plan) => plan.id === storeEditForm.planId);
  const [storeToArchive, setStoreToArchive] = useState<Store | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [storeToPay, setStoreToPay] = useState<Store | null>(null);
  const [storeToSell, setStoreToSell] = useState<Store | null>(null);
  const ownerOptions = owners.map((owner) => ({ value: owner.id, label: owner.name }));
  const query = search.trim().toLowerCase();
  const shown = (stores ?? []).filter((store) => !query || [store.name, store.slug, store.ownerName].some((text) => text?.toLowerCase().includes(query)));

  async function load() {
    const [ownersRes, storesRes] = await Promise.all([api.get("/admin/owners"), api.get("/admin/stores")]);
    setOwners(ownersRes.data);
    setStores(storesRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<unknown>, fallback: string) {
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      toast.show(errorMessage(err, fallback), { tone: "danger" });
      return false;
    }
  }

  function openEditStore(store: Store) {
    setStoreToEdit(store);
    setStoreEditForm({
      ownerId: store.ownerId,
      name: store.name,
      slug: store.slug,
      description: store.description ?? "",
      address: store.address ?? "",
      workingHours: store.workingHours ?? "",
      phone: store.phone ?? "",
      whatsapp: store.whatsapp ?? "",
      telegram: store.telegram ?? "",
      instagram: store.instagram ?? "",
      vk: store.vk ?? "",
      subscriptionEndsAt: toDateTimeLocal(store.subscriptionEndsAt),
      planId: store.planId ?? "",
      aiMonthlyLimit: store.aiMonthlyLimit == null ? "" : String(store.aiMonthlyLimit)
    });
  }

  async function updateStore(event: FormEvent) {
    event.preventDefault();
    if (!storeToEdit || !storeEditForm.ownerId) return;
    const limit = storeEditForm.aiMonthlyLimit.trim();
    if (limit && !/^\d+$/.test(limit)) {
      toast.show("Лимит ИИ — целое число или пусто", { tone: "danger" });
      return;
    }
    const payload: Partial<ReturnType<typeof storePayload>> = storePayload(storeEditForm);
    // The form shows minutes only: resending an untouched date would cut its seconds
    // and break «Отменить оплату», which matches the exact paid date.
    if (storeEditForm.subscriptionEndsAt === toDateTimeLocal(storeToEdit.subscriptionEndsAt)) delete payload.subscriptionEndsAt;
    if (await run(() => api.patch(`/admin/stores/${storeToEdit.id}`, payload), "Не удалось сохранить магазин")) {
      setStoreToEdit(null);
    }
  }

  async function toggle(store: Store) {
    await run(() => api.post(`/admin/stores/${store.id}/${store.isActive ? "disable" : "enable"}`), "Не удалось изменить статус магазина");
    setStoreToArchive(null);
  }

  async function deleteStore() {
    if (!storeToDelete) return;
    await run(() => api.delete(`/admin/stores/${storeToDelete.id}`), "Не удалось удалить магазин");
    setStoreToDelete(null);
  }

  function field(key: keyof StoreFormState) {
    return {
      value: storeEditForm[key],
      onChange: (event: { target: { value: string } }) => setStoreEditForm({ ...storeEditForm, [key]: event.target.value })
    };
  }

  return (
    <Page>
      <PageHeader
        title="Управление магазинами"
        description="Новому клиенту — «Подключить магазин»: владелец, магазин и пробный период одной формой. Тому, у кого уже есть кабинет, — «Ещё магазин»."
        back={{ to: "/admin", label: "Назад в админку" }}
        actions={
          <>
            <Button variant="secondary" icon={StoreAdd01Icon} onClick={() => setIsAdding(true)}>
              Ещё магазин
            </Button>
            <ButtonLink variant="primary" icon={PlusSignIcon} to="/admin/connect">
              Подключить магазин
            </ButtonLink>
          </>
        }
      />
      <Card as="section" padding="lg">
        <CardHeader title={stores?.length ? `Магазины · ${stores.length}` : "Магазины"} />
        {stores && stores.length >= SEARCH_FROM && (
          <Input icon={Search01Icon} aria-label="Поиск магазина" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Магазин, адрес или владелец" />
        )}
        {stores?.length ? (
          shown.length ? (
            <div className={styles.list}>
              {shown.map((store) => {
                const status = store.isActive
                  ? subscriptionBadge(store.subscription)
                  : store.servingEndedAt
                    ? { tone: "danger" as const, label: "Не обслуживается" }
                    : { tone: "neutral" as const, label: "В архиве" };
                return (
                  <div className={styles.store} key={store.id}>
                    <div className={styles.main}>
                      <span className={styles.icon}>
                        <Icon icon={Store01Icon} size="md" strokeWidth={1.6} />
                      </span>
                      <div className={styles.text}>
                        <strong>{store.name}</strong>
                        <small>
                          <a href={`/m/${store.slug}`} target="_blank" rel="noreferrer">
                            /m/{store.slug}
                          </a>
                          {store.ownerName && ` · ${store.ownerName}`}
                        </small>
                      </div>
                    </div>
                    <div className={styles.badges}>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <Badge tone={store.aiFormEnabled ? "accent" : "neutral"}>{plans?.find((plan) => plan.id === store.planId)?.name ?? "Без тарифа"}</Badge>
                    </div>
                    <div className={styles.actions}>
                      <Button variant="primary" size="sm" icon={Money03Icon} onClick={() => setStoreToPay(store)}>
                        Продлить
                      </Button>
                      <Button variant="secondary" size="sm" icon={ShoppingBasketAdd01Icon} onClick={() => setStoreToSell(store)}>
                        Пакет
                      </Button>
                      <Menu
                        label={`Ещё действия с магазином ${store.name}`}
                        items={[
                          { label: "Редактировать", icon: Edit02Icon, onSelect: () => openEditStore(store) },
                          store.isActive
                            ? { label: "Архивировать", icon: ArchiveArrowDownIcon, onSelect: () => setStoreToArchive(store) }
                            : { label: "Восстановить", icon: ArchiveArrowUpIcon, onSelect: () => toggle(store) },
                          { label: "Удалить", icon: Delete02Icon, danger: true, onSelect: () => setStoreToDelete(store) }
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Search01Icon} title="Ничего не нашлось" description="Проверьте название или имя владельца." />
          )
        ) : (
          stores && <EmptyState icon={Store01Icon} title="Магазинов пока нет" description="Нажмите «Подключить магазин» — владелец, магазин и пробный период одной формой." />
        )}
      </Card>

      {isAdding && (
        <AddStoreModal
          owners={owners}
          stores={stores ?? []}
          onClose={() => setIsAdding(false)}
          onCreated={() => {
            setIsAdding(false);
            toast.show("Магазин создан", { tone: "success" });
            load();
          }}
        />
      )}

      {storeToEdit && (
        <Modal
          title="Редактировать магазин"
          description={`/m/${storeToEdit.slug}`}
          onClose={() => setStoreToEdit(null)}
          closeOnBackdrop={false}
          onSubmit={updateStore}
          footer={
            <>
              <Button variant="secondary" onClick={() => setStoreToEdit(null)}>
                Отмена
              </Button>
              <Button type="submit" variant="primary">
                Сохранить
              </Button>
            </>
          }
        >
          <Field label="Владелец" required>
            <Select placeholder="Выберите" value={storeEditForm.ownerId} onChange={(value) => setStoreEditForm({ ...storeEditForm, ownerId: value })} options={ownerOptions} />
          </Field>
          <Field label="Название" required>
            <Input {...field("name")} required />
          </Field>
          <Field label="Адрес витрины" hint={`${window.location.host}/m/${storeEditForm.slug}`} required>
            <Input {...field("slug")} required />
          </Field>
          <Field label="Описание">
            <Textarea {...field("description")} />
          </Field>
          <Field label="Адрес">
            <Input {...field("address")} />
          </Field>
          <Field label="Часы работы">
            <Input placeholder="Ежедневно 10:00–20:00" {...field("workingHours")} />
          </Field>
          <Field label="Телефон">
            <Input type="tel" placeholder="+79280123456" {...field("phone")} />
          </Field>
          <Field label="WhatsApp">
            <Input type="tel" placeholder="+79280123456" {...field("whatsapp")} />
          </Field>
          <Field label="Telegram">
            <Input placeholder="@Name" {...field("telegram")} />
          </Field>
          <Field label="Instagram">
            <Input placeholder="@name" {...field("instagram")} />
          </Field>
          <Field label="ВКонтакте">
            <Input placeholder="vk.com/name" {...field("vk")} />
          </Field>
          <Field label="Подписка до" hint="Чтобы продлить с оплатой, нажмите «Продлить» у магазина — так платёж попадёт в учёт">
            <Input type="datetime-local" {...field("subscriptionEndsAt")} />
          </Field>
          {plans && (
            <Field label="Тариф" hint="ИИ-помощник и его лимит — как в тарифе">
              <Select
                value={storeEditForm.planId}
                onChange={(planId) => setStoreEditForm({ ...storeEditForm, planId })}
                options={plans.map((plan) => ({ value: plan.id, label: planLabel(plan) }))}
              />
            </Field>
          )}
          {editPlan?.aiEnabled ? (
            <Field label="Свой лимит ИИ в месяц" hint={`Карточек, созданных с помощью ИИ. Пусто — как в тарифе (${editPlan.aiMonthlyLimit})`}>
              <Input inputMode="numeric" placeholder={String(editPlan.aiMonthlyLimit ?? "")} {...field("aiMonthlyLimit")} />
            </Field>
          ) : null}
        </Modal>
      )}
      {storeToPay && (
        <AcceptPaymentModal
          store={storeToPay}
          onClose={() => setStoreToPay(null)}
          onPaid={() => {
            setStoreToPay(null);
            load();
          }}
        />
      )}
      {storeToSell && (
        <SellPackageModal
          store={storeToSell}
          onClose={() => setStoreToSell(null)}
          onSold={() => {
            setStoreToSell(null);
            load();
          }}
        />
      )}
      {storeToArchive && (
        <ConfirmModal
          title="Архивировать магазин?"
          description={`Публичная витрина "${storeToArchive.name}" станет недоступна клиентам.`}
          confirmLabel="Архивировать"
          danger
          onCancel={() => setStoreToArchive(null)}
          onConfirm={() => toggle(storeToArchive)}
        />
      )}
      {storeToDelete && (
        <ConfirmModal
          title="Удалить магазин?"
          description={`Магазин "${storeToDelete.name}" и все его товары будут удалены. Это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          onCancel={() => setStoreToDelete(null)}
          onConfirm={deleteStore}
        />
      )}
    </Page>
  );
}
