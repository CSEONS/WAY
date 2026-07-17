import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Store } from "../types/models";

export function SettingsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<Store>();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const logoPreviewUrl = useMemo(() => logoFile ? URL.createObjectURL(logoFile) : store?.logoUrl ?? "", [logoFile, store?.logoUrl]);

  useEffect(() => {
    return () => { if (logoFile && logoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl); };
  }, [logoFile, logoPreviewUrl]);

  useEffect(() => {
    if (!storeId) return;
    api.get<Store>(`/owner/stores/${storeId}`).then((res) => setStore(res.data));
  }, [storeId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!storeId || !store) return;
    setIsSaving(true);
    setError("");
    try {
      const { data } = await api.patch<Store>(`/owner/stores/${storeId}`, {
        name: store.name,
        description: store.description,
        address: store.address,
        phone: store.phone,
        whatsapp: store.whatsapp,
        telegram: store.telegram
      });
      let updated = data;
      if (logoFile) {
        const formData = new FormData();
        formData.append("logo", logoFile);
        updated = (await api.post<Store>(`/owner/stores/${storeId}/logo`, formData)).data;
      }
      setStore(updated);
      setLogoFile(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось сохранить реквизиты");
    } finally {
      setIsSaving(false);
    }
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
        <label>
          Логотип магазина
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
        </label>
        {(logoFile || store.logoUrl) && (
          <div className="store-logo-preview">
            <img src={logoPreviewUrl} alt="Предпросмотр логотипа" />
            <span>{logoFile ? logoFile.name : "Текущий логотип"}</span>
          </div>
        )}
        <div className="action-row">
          <Link className="button-link" to={`/dashboard/stores/${store.id}`}>
            Назад к товарам
          </Link>
          <button className="primary" disabled={isSaving}>{isSaving ? "Сохраняю..." : "Сохранить"}</button>
        </div>
        {error && <p className="error">{error}</p>}
        {saved && <div className="toast success" role="status">Реквизиты сохранены</div>}
      </form>
    </section>
  );
}
