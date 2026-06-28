import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "./api/client";
import { Layout } from "./components/Layout";
import { AppRoutes } from "./routes/AppRoutes";
import "./styles/global.css";
import type { User } from "./types/models";

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => Boolean(localStorage.getItem("token")));

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsAuthLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setIsAuthLoading(false));
  }, []);

  return (
    <BrowserRouter>
      <Layout user={user} onLogout={() => setUser(null)} />
      <AppRoutes user={user} isAuthLoading={isAuthLoading} onLogin={setUser} />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
