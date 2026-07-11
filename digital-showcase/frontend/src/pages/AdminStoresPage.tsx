import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { ConfirmModal } from "../components/ConfirmModal";
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
  logoUrl: string;
  coverUrl: string;
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
  logoUrl: "",
  coverUrl: "",
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
    logoUrl: form.logoUrl || null,
    coverUrl: form.coverUrl || null,
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
      logoUrl: store.logoUrl ?? "",
      coverUrl: store.coverUrl ?? "",
      subscriptionEndsAt: toDateTimeLocal(store.subscriptionEndsAt)
    });
  }

  async function updateStore(event: FormEvent) {
    event.preventDefault();
    if (!storeToEdit) return;
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
    <section>
      <h1>Управление магазинами</h1>
      <p>Создавайте и управляйте магазинами отдельно от владельцев.</p>
      <div className="admin-grid">
        <div className="panel">
          <h2>Создать магазин</h2>
          <form className="form" onSubmit={createStore}>
            <label>
              Владелец
              <select value={storeForm.ownerId} onChange={(e) => setStoreForm({ ...storeForm, ownerId: e.target.value })} required>
                <option value="">Выберите</option>
                {owners.map((owner) => (
                  <option value={owner.id} key={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
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
            <button className="primary">Создать</button>
          </form>
        </div>
        <div className="panel">
          <h2>Список магазинов</h2>
          <div className="table">
            {stores.map((store) => (
              <div className="row" key={store.id}>
                <span>
                  <strong>{store.name}</strong>
                  <br />/m/{store.slug}
                </span>
                <span>
                  {store.isActive ? "Активен" : "В архиве"}
                  <br />до {store.subscriptionEndsAt ? new Date(store.subscriptionEndsAt).toLocaleDateString("ru-RU") : "без даты"}
                </span>
                <span>{store.ownerName}</span>
                <button onClick={() => extend(store.id)}>+30 дней</button>
                <button onClick={() => openEditStore(store)}>Редактировать</button>
                <button onClick={() => toggleAiForm(store)}>{store.aiFormEnabled ? "Отключить ИИ" : "Включить ИИ"}</button>
                <button onClick={() => (store.isActive ? setStoreToArchive(store) : toggle(store))}>{store.isActive ? "Архивировать" : "Восстановить"}</button>
                <button className="danger" onClick={() => setStoreToDelete(store)}>Удалить</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {storeToEdit && (
        <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.currentTarget === event.target && setStoreToEdit(null)}>
          <div className="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="edit-store-title">
            <div className="modal-head">
              <div>
                <h2 id="edit-store-title">Редактировать магазин</h2>
                <p>/m/{storeToEdit.slug}</p>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть" onClick={() => setStoreToEdit(null)}>
                <CloseIcon />
              </button>
            </div>
            <form className="form" onSubmit={updateStore}>
              <label>
                Владелец
                <select value={storeEditForm.ownerId} onChange={(e) => setStoreEditForm({ ...storeEditForm, ownerId: e.target.value })} required>
                  <option value="">Выберите</option>
                  {owners.map((owner) => (
                    <option value={owner.id} key={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>Название<input value={storeEditForm.name} onChange={(e) => setStoreEditForm({ ...storeEditForm, name: e.target.value })} required /></label>
              <label>Slug<input value={storeEditForm.slug} onChange={(e) => setStoreEditForm({ ...storeEditForm, slug: e.target.value })} required /></label>
              <label>Описание<textarea value={storeEditForm.description} onChange={(e) => setStoreEditForm({ ...storeEditForm, description: e.target.value })} /></label>
              <label>Адрес<input value={storeEditForm.address} onChange={(e) => setStoreEditForm({ ...storeEditForm, address: e.target.value })} /></label>
              <label>Телефон<input value={storeEditForm.phone} onChange={(e) => setStoreEditForm({ ...storeEditForm, phone: e.target.value })} /></label>
              <label>WhatsApp<input value={storeEditForm.whatsapp} onChange={(e) => setStoreEditForm({ ...storeEditForm, whatsapp: e.target.value })} /></label>
              <label>Telegram<input value={storeEditForm.telegram} onChange={(e) => setStoreEditForm({ ...storeEditForm, telegram: e.target.value })} /></label>
              <label>Логотип URL<input value={storeEditForm.logoUrl} onChange={(e) => setStoreEditForm({ ...storeEditForm, logoUrl: e.target.value })} /></label>
              <label>Обложка URL<input value={storeEditForm.coverUrl} onChange={(e) => setStoreEditForm({ ...storeEditForm, coverUrl: e.target.value })} /></label>
              <label>Подписка до<input type="datetime-local" value={storeEditForm.subscriptionEndsAt} onChange={(e) => setStoreEditForm({ ...storeEditForm, subscriptionEndsAt: e.target.value })} /></label>
              <div className="modal-actions">
                <button type="button" onClick={() => setStoreToEdit(null)}>Отмена</button>
                <button className="primary">Сохранить</button>
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
      <p>
        <Link to="/admin">← Назад в админку</Link>
      </p>
    </section>
  );
}

function CloseIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.7 5.3 12 10.6l5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3z" />
    </svg>
  );
}
