import {
  AiMagicIcon,
  ArchiveArrowDownIcon,
  ArchiveArrowUpIcon,
  CalendarAdd01Icon,
  Delete02Icon,
  Edit02Icon,
  Store01Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Store, User } from "../types/models";
import { Badge, Button, Card, CardHeader, ConfirmModal, EmptyState, Field, Icon, Input, Modal, Page, PageHeader, Select, Textarea, useToast } from "../ui";
import styles from "./Admin.module.css";

interface StoreFormState {
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  address: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  subscriptionEndsAt: string;
}

const emptyStoreForm: StoreFormState = {
  ownerId: "",
  name: "",
  slug: "",
  description: "",
  address: "",
  phone: "",
  whatsapp: "",
  telegram: "",
  subscriptionEndsAt: ""
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
    phone: form.phone || null,
    whatsapp: form.whatsapp || null,
    telegram: form.telegram || null,
    subscriptionEndsAt: toIsoDate(form.subscriptionEndsAt)
  };
}

function errorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? fallback;
}

export function AdminStoresPage() {
  const toast = useToast();
  const [owners, setOwners] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeForm, setStoreForm] = useState<StoreFormState>(emptyStoreForm);
  const [isCreating, setIsCreating] = useState(false);
  const [storeToEdit, setStoreToEdit] = useState<Store | null>(null);
  const [storeEditForm, setStoreEditForm] = useState<StoreFormState>(emptyStoreForm);
  const [storeToArchive, setStoreToArchive] = useState<Store | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const ownerOptions = owners.map((owner) => ({ value: owner.id, label: owner.name }));

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

  async function createStore(event: FormEvent) {
    event.preventDefault();
    if (!storeForm.ownerId) {
      toast.show("Выберите владельца", { tone: "danger" });
      return;
    }
    setIsCreating(true);
    const isCreated = await run(() => api.post("/admin/stores", { ...storePayload(storeForm), isActive: 1 }), "Не удалось создать магазин");
    setIsCreating(false);
    if (isCreated) {
      setStoreForm(emptyStoreForm);
      toast.show("Магазин создан", { tone: "success" });
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
      phone: store.phone ?? "",
      whatsapp: store.whatsapp ?? "",
      telegram: store.telegram ?? "",
      subscriptionEndsAt: toDateTimeLocal(store.subscriptionEndsAt)
    });
  }

  async function updateStore(event: FormEvent) {
    event.preventDefault();
    if (!storeToEdit || !storeEditForm.ownerId) return;
    if (await run(() => api.patch(`/admin/stores/${storeToEdit.id}`, storePayload(storeEditForm)), "Не удалось сохранить магазин")) {
      setStoreToEdit(null);
    }
  }

  async function toggle(store: Store) {
    await run(() => api.post(`/admin/stores/${store.id}/${store.isActive ? "archive" : "restore"}`), "Не удалось изменить статус магазина");
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
        description="Создавайте и управляйте магазинами отдельно от владельцев."
        back={{ to: "/admin", label: "Назад в админку" }}
      />
      <div className={styles.columns}>
        <Card as="section" padding="lg">
          <CardHeader title="Создать магазин" />
          <form className={styles.form} onSubmit={createStore}>
            <Field label="Владелец" required>
              <Select placeholder="Выберите" value={storeForm.ownerId} onChange={(value) => setStoreForm({ ...storeForm, ownerId: value })} options={ownerOptions} />
            </Field>
            <Field label="Название" required>
              <Input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} required />
            </Field>
            <Field label="Slug" hint="Адрес витрины: /m/slug" required>
              <Input value={storeForm.slug} onChange={(e) => setStoreForm({ ...storeForm, slug: e.target.value })} required />
            </Field>
            <Field label="Подписка до">
              <Input type="datetime-local" value={storeForm.subscriptionEndsAt} onChange={(e) => setStoreForm({ ...storeForm, subscriptionEndsAt: e.target.value })} />
            </Field>
            <Button type="submit" variant="primary" loading={isCreating}>
              Создать
            </Button>
          </form>
        </Card>
        <Card as="section" padding="lg">
          <CardHeader title="Список магазинов" />
          {stores.length ? (
            <div className={styles.list}>
              {stores.map((store) => (
                <div className={styles.row} key={store.id}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowIcon}>
                      <Icon icon={Store01Icon} size="md" strokeWidth={1.6} />
                    </span>
                    <div className={styles.rowText}>
                      <strong>{store.name}</strong>
                      <small>/m/{store.slug}</small>
                    </div>
                  </div>
                  <div className={styles.rowMeta}>
                    <Badge tone={store.isActive ? "success" : "neutral"}>{store.isActive ? "Активен" : "В архиве"}</Badge>
                    <span>до {store.subscriptionEndsAt ? new Date(store.subscriptionEndsAt).toLocaleDateString("ru-RU") : "без даты"}</span>
                    <span>{store.ownerName}</span>
                  </div>
                  <div className={styles.rowActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={CalendarAdd01Icon}
                      onClick={() => run(() => api.post(`/admin/stores/${store.id}/extend-subscription`, { days: 30 }), "Не удалось продлить подписку")}
                    >
                      +30 дней
                    </Button>
                    <Button variant="secondary" size="sm" icon={Edit02Icon} onClick={() => openEditStore(store)}>
                      Редактировать
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={AiMagicIcon}
                      onClick={() =>
                        run(() => api.post(`/admin/stores/${store.id}/${store.aiFormEnabled ? "disable-ai-form" : "enable-ai-form"}`), "Не удалось переключить ИИ")
                      }
                    >
                      {store.aiFormEnabled ? "Отключить ИИ" : "Включить ИИ"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={store.isActive ? ArchiveArrowDownIcon : ArchiveArrowUpIcon}
                      onClick={() => (store.isActive ? setStoreToArchive(store) : toggle(store))}
                    >
                      {store.isActive ? "Архивировать" : "Восстановить"}
                    </Button>
                    <Button variant="danger" size="sm" icon={Delete02Icon} className={styles.pushRight} onClick={() => setStoreToDelete(store)}>
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Store01Icon} title="Магазинов пока нет" description="Создайте первый магазин в форме слева." />
          )}
        </Card>
      </div>

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
          <Field label="Slug" required>
            <Input {...field("slug")} required />
          </Field>
          <Field label="Описание">
            <Textarea {...field("description")} />
          </Field>
          <Field label="Адрес">
            <Input {...field("address")} />
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
          <Field label="Подписка до">
            <Input type="datetime-local" {...field("subscriptionEndsAt")} />
          </Field>
        </Modal>
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
