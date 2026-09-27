import { ImageAdd01Icon } from "@hugeicons/core-free-icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Store } from "../types/models";
import { compressImage } from "../utils/compressImage";
import { Button, ButtonLink, Card, EmptyState, ErrorState, Field, FileButton, Input, LoadingState, Notice, Page, PageHeader, Textarea, useToast } from "../ui";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { storeId } = useParams();
  const toast = useToast();
  const [store, setStore] = useState<Store>();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasLoadError, setHasLoadError] = useState(false);
  const logoPreviewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : store?.logoUrl ?? ""), [logoFile, store?.logoUrl]);

  useEffect(() => {
    return () => {
      if (logoFile && logoPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoFile, logoPreviewUrl]);

  const load = useCallback(() => {
    if (!storeId) return;
    setHasLoadError(false);
    api
      .get<Store>(`/owner/stores/${storeId}`)
      .then((res) => setStore(res.data))
      .catch(() => setHasLoadError(true));
  }, [storeId]);

  useEffect(load, [load]);

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
        workingHours: store.workingHours,
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
      toast.show("Реквизиты сохранены", { tone: "success" });
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось сохранить реквизиты");
    } finally {
      setIsSaving(false);
    }
  }

  if (!storeId) {
    return (
      <Page width="narrow">
        <EmptyState
          title="Сначала выберите магазин"
          action={
            <ButtonLink variant="primary" to="/dashboard">
              К выбору магазина
            </ButtonLink>
          }
        />
      </Page>
    );
  }

  if (hasLoadError) {
    return (
      <Page width="narrow">
        <ErrorState onRetry={load} />
      </Page>
    );
  }

  if (!store) {
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title="Реквизиты магазина" back={{ to: `/dashboard/stores/${storeId}`, label: "Вернуться назад" }} />
      <Card as="section" padding="lg">
        <form className={styles.form} onSubmit={submit}>
          <Field label="Название">
            <Input value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} />
          </Field>
          <Field label="Описание">
            <Textarea value={store.description ?? ""} onChange={(e) => setStore({ ...store, description: e.target.value })} />
          </Field>
          <Field label="Адрес">
            <Input value={store.address ?? ""} onChange={(e) => setStore({ ...store, address: e.target.value })} />
          </Field>
          <Field label="Часы работы" hint="Покупатели увидят их на витрине рядом с адресом">
            <Input
              value={store.workingHours ?? ""}
              placeholder="Ежедневно 10:00–20:00"
              onChange={(e) => setStore({ ...store, workingHours: e.target.value })}
            />
          </Field>
          <Field label="Телефон">
            <Input type="tel" value={store.phone ?? ""} placeholder="+79280123456" onChange={(e) => setStore({ ...store, phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp">
            <Input type="tel" value={store.whatsapp ?? ""} placeholder="+79280123456" onChange={(e) => setStore({ ...store, whatsapp: e.target.value })} />
          </Field>
          <Field label="Telegram">
            <Input value={store.telegram ?? ""} placeholder="@Name" onChange={(e) => setStore({ ...store, telegram: e.target.value })} />
          </Field>
          <div className={styles.logo}>
            <span className={styles.logoLabel}>Логотип магазина</span>
            <div className={styles.logoRow}>
              <span className={styles.logoPreview}>{logoPreviewUrl ? <img src={logoPreviewUrl} alt="Предпросмотр логотипа" /> : null}</span>
              <div className={styles.logoText}>
                <FileButton icon={ImageAdd01Icon} size="sm" accept="image/jpeg,image/png,image/webp" onFiles={([file]) => void compressImage(file, 1024).then(setLogoFile)}>
                  {logoPreviewUrl ? "Заменить логотип" : "Загрузить логотип"}
                </FileButton>
                <span className={styles.logoName}>{logoFile ? logoFile.name : store.logoUrl ? "Текущий логотип" : "Логотип не загружен"}</span>
              </div>
            </div>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={isSaving}>
            Сохранить
          </Button>
        </form>
      </Card>
    </Page>
  );
}
