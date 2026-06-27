import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Store } from "../types/models";

export function SettingsPage() {
  const [store, setStore] = useState<Store>();

  useEffect(() => {
    api.get("/owner/store").then((res) => setStore(res.data));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { data } = await api.patch("/owner/store", store);
    setStore(data);
  }

  if (!store) return <section className="empty">Загрузка...</section>;
  return (
    <section className="narrow">
      <h1>Настройки магазина</h1>
      <form className="form" onSubmit={submit}>
        <label>Название<input value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} /></label>
        <label>Описание<textarea value={store.description ?? ""} onChange={(e) => setStore({ ...store, description: e.target.value })} /></label>
        <label>Адрес<input value={store.address ?? ""} onChange={(e) => setStore({ ...store, address: e.target.value })} /></label>
        <label>Телефон<input value={store.phone ?? ""} onChange={(e) => setStore({ ...store, phone: e.target.value })} /></label>
        <label>WhatsApp<input value={store.whatsapp ?? ""} onChange={(e) => setStore({ ...store, whatsapp: e.target.value })} /></label>
        <label>Telegram<input value={store.telegram ?? ""} onChange={(e) => setStore({ ...store, telegram: e.target.value })} /></label>
        <label>Логотип URL<input value={store.logoUrl ?? ""} onChange={(e) => setStore({ ...store, logoUrl: e.target.value })} /></label>
        <label>Обложка URL<input value={store.coverUrl ?? ""} onChange={(e) => setStore({ ...store, coverUrl: e.target.value })} /></label>
        <button className="primary">Сохранить</button>
      </form>
    </section>
  );
}
