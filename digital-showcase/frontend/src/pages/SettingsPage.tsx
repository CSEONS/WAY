import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Store } from "../types/models";

export function SettingsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<Store>();

  useEffect(() => {
    if (!storeId) return;
    api.get<Store>(`/owner/stores/${storeId}`).then((res) => setStore(res.data));
  }, [storeId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!storeId || !store) return;
    const { data } = await api.patch<Store>(`/owner/stores/${storeId}`, store);
    setStore(data);
  }

  if (!storeId) {
    return (
      <section className="empty">
        <div>
          <p>Сначала выберите магазин.</p>
          <Link className="button-link" to="/dashboard">
            К выбору магазина
          </Link>
        </div>
      </section>
    );
  }

  if (!store) return <section className="empty">Загрузка...</section>;

  return (
    <section className="narrow">
      <p className="eyebrow">{store.name}</p>
      <h1>Реквизиты магазина</h1>
      <form className="form" onSubmit={submit}>
        <label>Название<input value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} /></label>
        <label>Описание<textarea value={store.description ?? ""} onChange={(e) => setStore({ ...store, description: e.target.value })} /></label>
        <label>Адрес<input value={store.address ?? ""} onChange={(e) => setStore({ ...store, address: e.target.value })} /></label>
        <label>Телефон<input value={store.phone ?? ""} onChange={(e) => setStore({ ...store, phone: e.target.value })} /></label>
        <label>WhatsApp<input value={store.whatsapp ?? ""} onChange={(e) => setStore({ ...store, whatsapp: e.target.value })} /></label>
        <label>Telegram<input value={store.telegram ?? ""} onChange={(e) => setStore({ ...store, telegram: e.target.value })} /></label>
        <label>Логотип URL<input value={store.logoUrl ?? ""} onChange={(e) => setStore({ ...store, logoUrl: e.target.value })} /></label>
        <label>Обложка URL<input value={store.coverUrl ?? ""} onChange={(e) => setStore({ ...store, coverUrl: e.target.value })} /></label>
        <div className="action-row">
          <Link className="button-link" to={`/dashboard/stores/${store.id}`}>
            Назад к товарам
          </Link>
          <button className="primary">Сохранить</button>
        </div>
      </form>
    </section>
  );
}
