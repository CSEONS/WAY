import { LockKeyIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { User } from "../types/models";
import { Button, Field, Icon, Input, Notice } from "../ui";
import styles from "./LoginPage.module.css";

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { login, password });
      localStorage.setItem("token", data.token);
      onLogin(data.user);
      navigate(data.user.role === "ADMIN" ? "/admin" : "/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось войти");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.shell}>
      <div className={styles.card}>
        <span className={styles.icon}>
          <Icon icon={LockKeyIcon} size="md" />
        </span>
        <div className={styles.heading}>
          <h1 className={styles.title}>Вход</h1>
          <p className={styles.subtitle}>Войдите, чтобы управлять магазином или витринами.</p>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <Field label="Почта или телефон">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="Логин" />
          </Field>
          <Field label="Пароль">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Пароль" />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" variant="primary" size="lg" block loading={isSubmitting}>
            Войти
          </Button>
        </form>
      </div>
    </section>
  );
}
