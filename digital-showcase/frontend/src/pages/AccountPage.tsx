import { FormEvent, useState } from "react";
import { api } from "../api/client";
import type { User } from "../types/models";
import { Button, Card, CardHeader, Field, Input, Notice, Page, PageHeader, useToast } from "../ui";
import styles from "./AccountPage.module.css";

export function AccountPage({ user }: { user: User | null }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const mismatch = Boolean(repeatPassword) && repeatPassword !== newPassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setError("");
    setIsSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      toast.show("Пароль изменён", { tone: "success" });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Не удалось сменить пароль");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page width="narrow">
      <PageHeader
        title="Аккаунт"
        description={[user?.name, user?.phone, user?.email].filter(Boolean).join(" · ")}
        back={{ to: user?.role === "ADMIN" ? "/admin" : "/dashboard", label: "Назад" }}
      />
      <Card as="section" padding="lg">
        <CardHeader title="Сменить пароль" description="Для входа можно использовать почту или телефон в любом виде: 8 928…, +7 928…" />
        <form className={styles.form} onSubmit={submit}>
          <Field label="Текущий пароль" required>
            <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="Новый пароль" hint="Минимум 6 символов" required>
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} required />
          </Field>
          <Field label="Новый пароль ещё раз" error={mismatch ? "Пароли не совпадают" : undefined} required>
            <Input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" required />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={isSaving} disabled={mismatch}>
            Сменить пароль
          </Button>
        </form>
      </Card>
    </Page>
  );
}
