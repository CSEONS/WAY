import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { User } from "../types/models";

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [login, setLogin] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
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
    <section className="page page-narrow page-login">
      <h1>Вход</h1>
      <form className="app-form auth-form" onSubmit={submit}>
        <label>Почта или телефон<input value={login} onChange={(e) => setLogin(e.target.value)} /></label>
        <label>Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p>{error}</p>}
        <button>Войти</button>
      </form>
    </section>
  );
}
