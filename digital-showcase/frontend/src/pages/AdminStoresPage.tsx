import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiMagicIcon,
  ArchiveArrowDownIcon,
  ArchiveArrowUpIcon,
  CalendarAdd01Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  Store01Icon
} from "@hugeicons/core-free-icons";
import { ArrowLeft } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
import { Select } from "../components/Select";
import type { Store, User } from "../types/models";

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

export function AdminStoresPage() {
  const [owners, setOwners] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeForm, setStoreForm] = useState<StoreFormState>(emptyStoreForm);
  const [storeToEdit, setStoreToEdit] = useState<Store | null>(null);
  const [storeEditForm, setStoreEditForm] = useState<StoreFormState>(emptyStoreForm);
  const [storeToArchive, setStoreToArchive] = useState<Store | null>(null);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);

  async function load() {
    const [ownersRes, storesRes] = await Promise.all([api.get("/admin/owners"), api.get("/admin/stores")]);
    setOwners(ownersRes.data);
    setStores(storesRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function closeModal(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setStoreToEdit(null);
      setStoreToArchive(null);
      setStoreToDelete(null);
    }

    document.addEventListener("keydown", closeModal);
    return () => document.removeEventListener("keydown", closeModal);
  }, []);

  async function createStore(event: FormEvent) {
    event.preventDefault();
    if (!storeForm.ownerId) return;
    await api.post("/admin/stores", { ...storePayload(storeForm), isActive: 1 });
    setStoreForm(emptyStoreForm);
    load();
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
    await api.patch(`/admin/stores/${storeToEdit.id}`, storePayload(storeEditForm));
    setStoreToEdit(null);
    load();
  }

  async function extend(id: string) {
    await api.post(`/admin/stores/${id}/extend-subscription`, { days: 30 });
    load();
  }

  async function toggle(store: Store) {
    await api.post(`/admin/stores/${store.id}/${store.isActive ? "archive" : "restore"}`);
    setStoreToArchive(null);
    load();
  }

  async function toggleAiForm(store: Store) {
    await api.post(`/admin/stores/${store.id}/${store.aiFormEnabled ? "disable-ai-form" : "enable-ai-form"}`);
    load();
  }

  async function deleteStore() {
    if (!storeToDelete) return;
    await api.delete(`/admin/stores/${storeToDelete.id}`);
    setStoreToDelete(null);
    load();
  }

  return (
    <section className="page page-admin-stores page-legacy">
      <Link className="back-link" to="/admin">
        <ArrowLeft size={16} strokeWidth={2} />
        Назад в админку
      </Link>
      <h1>Управление магазинами</h1>
      <p>Создавайте и управляйте магазинами отдельно от владельцев.</p>
      <div>
        <div className="panel">
          <h2>Создать магазин</h2>
          <form className="app-form" onSubmit={createStore}>
            <label>
              Владелец
              <Select
                ariaLabel="Владелец"
                placeholder="Выберите"
                value={storeForm.ownerId}
                onChange={(value) => setStoreForm({ ...storeForm, ownerId: value })}
                options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
              />
            </label>
            <label>
              Название
              <input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} required />
            </label>
            <label>
              Slug
              <input value={storeForm.slug} onChange={(e) => setStoreForm({ ...storeForm, slug: e.target.value })} required />
            </label>
            <label>
              Подписка до
              <input type="datetime-local" value={storeForm.subscriptionEndsAt} onChange={(e) => setStoreForm({ ...storeForm, subscriptionEndsAt: e.target.value })} />
            </label>
            <button className="btn btn-primary">Создать</button>
          </form>
        </div>
        <div className="panel">
          <h2>Список магазинов</h2>
          <div className="stack-list">
            {stores.map((store) => (
              <div className="list-row" key={store.id}>
                <div className="list-row-main">
                  <span className="list-row-icon">
                    <HugeiconsIcon icon={Store01Icon} size={18} strokeWidth={1.6} />
                  </span>
                  <div>
                    <strong>{store.name}</strong>
                    <small>/m/{store.slug}</small>
                  </div>
                </div>
                <div className="list-row-meta">
                  <span className={`badge ${store.isActive ? "badge-success" : "badge-neutral"}`}>{store.isActive ? "Активен" : "В архиве"}</span>
                  <span>до {store.subscriptionEndsAt ? new Date(store.subscriptionEndsAt).toLocaleDateString("ru-RU") : "без даты"}</span>
                  <span>{store.ownerName}</span>
                </div>
                <div className="list-row-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => extend(store.id)}>
                    <HugeiconsIcon icon={CalendarAdd01Icon} size={15} strokeWidth={1.8} />
                    +30 дней
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditStore(store)}>
                    <HugeiconsIcon icon={Edit02Icon} size={15} strokeWidth={1.8} />
                    Редактировать
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleAiForm(store)}>
                    <HugeiconsIcon icon={AiMagicIcon} size={15} strokeWidth={1.8} />
                    {store.aiFormEnabled ? "Отключить ИИ" : "Включить ИИ"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => (store.isActive ? setStoreToArchive(store) : toggle(store))}>
                    <HugeiconsIcon icon={store.isActive ? ArchiveArrowDownIcon : ArchiveArrowUpIcon} size={15} strokeWidth={1.8} />
                    {store.isActive ? "Архивировать" : "Восстановить"}
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setStoreToDelete(store)}>
                    <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {storeToEdit && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setStoreToEdit(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="modal-title">
                <h2>Редактировать магазин</h2>
                <p>/m/{storeToEdit.slug}</p>
              </div>
              <button type="button" className="btn-icon btn-ghost" aria-label="Закрыть" onClick={() => setStoreToEdit(null)}>
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
              </button>
            </div>
            <form className="app-form" onSubmit={updateStore}>
              <label>
                Владелец
                <Select
                  ariaLabel="Владелец"
                  placeholder="Выберите"
                  value={storeEditForm.ownerId}
                  onChange={(value) => setStoreEditForm({ ...storeEditForm, ownerId: value })}
                  options={owners.map((owner) => ({ value: owner.id, label: owner.name }))}
                />
              </label>
              <label>Название<input value={storeEditForm.name} onChange={(e) => setStoreEditForm({ ...storeEditForm, name: e.target.value })} required /></label>
              <label>Slug<input value={storeEditForm.slug} onChange={(e) => setStoreEditForm({ ...storeEditForm, slug: e.target.value })} required /></label>
              <label>Описание<textarea value={storeEditForm.description} onChange={(e) => setStoreEditForm({ ...storeEditForm, description: e.target.value })} /></label>
              <label>Адрес<input value={storeEditForm.address} onChange={(e) => setStoreEditForm({ ...storeEditForm, address: e.target.value })} /></label>
              <label>Телефон<input type="tel" value={storeEditForm.phone} placeholder="+79280123456" onChange={(e) => setStoreEditForm({ ...storeEditForm, phone: e.target.value })} /></label>
              <label>WhatsApp<input type="tel" value={storeEditForm.whatsapp} placeholder="+79280123456" onChange={(e) => setStoreEditForm({ ...storeEditForm, whatsapp: e.target.value })} /></label>
              <label>Telegram<input value={storeEditForm.telegram} placeholder="@Name" onChange={(e) => setStoreEditForm({ ...storeEditForm, telegram: e.target.value })} /></label>
              <label>Подписка до<input type="datetime-local" value={storeEditForm.subscriptionEndsAt} onChange={(e) => setStoreEditForm({ ...storeEditForm, subscriptionEndsAt: e.target.value })} /></label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStoreToEdit(null)}>Отмена</button>
                <button className="btn btn-primary">Сохранить</button>
              </div>
            </form>
          </div>
        </div>
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
    </section>
  );
}
