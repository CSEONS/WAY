import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, LockKeyIcon } from "@hugeicons/core-free-icons";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { User } from "../types/models";

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/login", { login, password });
      localStorage.setItem("token", data.token);
      onLogin(data.user);
      navigate(data.user.role === "ADMIN" ? "/admin" : "/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Не удалось войти");
    }
  }

  return (
    <section className="page page-login">
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-icon">
            <HugeiconsIcon icon={LockKeyIcon} size={20} strokeWidth={1.8} />
          </div>
          <div className="auth-heading">
            <h1>Вход</h1>
            <p>Войдите, чтобы управлять магазином или витринами.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label>
              Почта или телефон
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="Логин" />
            </label>
            <label>
              Пароль
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Пароль" />
            </label>
            {error && (
              <p className="auth-error">
                <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.8} />
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-lg btn-block">Войти</button>
          </form>
        </div>
      </div>
    </section>
  );
}

