import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Store, User } from "../types/models";

export function AdminPage() {
  const [owners, setOwners] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [ownerForm, setOwnerForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [storeForm, setStoreForm] = useState({ ownerId: "", name: "", slug: "", subscriptionEndsAt: "" });

  async function load() {
    const [ownersRes, storesRes] = await Promise.all([api.get("/admin/owners"), api.get("/admin/stores")]);
    setOwners(ownersRes.data);
    setStores(storesRes.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function createOwner(event: FormEvent) {
    event.preventDefault();
    await api.post("/admin/owners", ownerForm);
    setOwnerForm({ name: "", email: "", phone: "", password: "" });
    load();
  }

  async function createStore(event: FormEvent) {
    event.preventDefault();
    await api.post("/admin/stores", { ...storeForm, isActive: 1, subscriptionEndsAt: storeForm.subscriptionEndsAt || null });
    setStoreForm({ ownerId: "", name: "", slug: "", subscriptionEndsAt: "" });
    load();
  }

  async function extend(id: string) {
    await api.post(`/admin/stores/${id}/extend-subscription`, { days: 30 });
    load();
  }

  async function toggle(store: Store) {
    await api.post(`/admin/stores/${store.id}/${store.isActive ? "disable" : "enable"}`);
    load();
  }

  return (
    <section>
      <h1>Админ-панель</h1>
      <div className="admin-grid">
        <div className="panel">
          <h2>Создать владельца</h2>
          <form className="form" onSubmit={createOwner}>
            <label>Имя<input value={ownerForm.name} onChange={(e) => setOwnerForm({ ...ownerForm, name: e.target.value })} required /></label>
            <label>Email<input value={ownerForm.email} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} /></label>
            <label>Телефон<input value={ownerForm.phone} onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })} /></label>
            <label>Пароль<input value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} required /></label>
            <button className="primary">Создать</button>
          </form>
        </div>
        <div className="panel">
          <h2>Создать магазин</h2>
          <form className="form" onSubmit={createStore}>
            <label>Владелец<select value={storeForm.ownerId} onChange={(e) => setStoreForm({ ...storeForm, ownerId: e.target.value })} required><option value="">Выберите</option>{owners.map((o) => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
            <label>Название<input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} required /></label>
            <label>Slug<input value={storeForm.slug} onChange={(e) => setStoreForm({ ...storeForm, slug: e.target.value })} required /></label>
            <label>Подписка до<input type="datetime-local" value={storeForm.subscriptionEndsAt} onChange={(e) => setStoreForm({ ...storeForm, subscriptionEndsAt: e.target.value })} /></label>
            <button className="primary">Создать</button>
          </form>
        </div>
      </div>
      <h2>Магазины</h2>
      <div className="table">
        {stores.map((store) => (
          <div className="row" key={store.id}>
            <span><strong>{store.name}</strong><br />/m/{store.slug}</span>
            <span>{store.isActive ? "Активен" : "Выключен"}<br />до {store.subscriptionEndsAt ? new Date(store.subscriptionEndsAt).toLocaleDateString("ru-RU") : "без даты"}</span>
            <span>{store.ownerName}</span>
            <button onClick={() => extend(store.id)}>+30 дней</button>
            <button onClick={() => toggle(store)}>{store.isActive ? "Выключить" : "Включить"}</button>
          </div>
        ))}
      </div>
      <h2>Владельцы</h2>
      <div className="table">
        {owners.map((owner) => <div className="row" key={owner.id}><span>{owner.name}</span><span>{owner.email || owner.phone}</span></div>)}
      </div>
    </section>
  );
}
