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

  useEffect(() => {
    if (localStorage.getItem("token")) {
      api.get("/auth/me").then((res) => setUser(res.data)).catch(() => localStorage.removeItem("token"));
    }
  }, []);

  return (
    <BrowserRouter>
      <Layout user={user} onLogout={() => setUser(null)} />
      <AppRoutes user={user} onLogin={setUser} />
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
