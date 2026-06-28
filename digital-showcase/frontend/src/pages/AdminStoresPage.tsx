import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { Store, User } from "../types/models";

export function AdminStoresPage() {
  const [owners, setOwners] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeForm, setStoreForm] = useState({ ownerId: "", name: "", slug: "", subscriptionEndsAt: "" });

  async function load() {
    const [ownersRes, storesRes] = await Promise.all([api.get("/admin/owners"), api.get("/admin/stores")]);
    setOwners(ownersRes.data);
    setStores(storesRes.data);
  }

  useEffect(() => {
    load();
  }, []);

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
    await api.post(`/admin/stores/${store.id}/${store.isActive ? "archive" : "restore"}`);
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
                <button onClick={() => toggle(store)}>{store.isActive ? "Архивировать" : "Восстановить"}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p>
        <Link to="/admin">← Назад в админку</Link>
      </p>
    </section>
  );
}
