// Global styles come first; UI-kit and page CSS Modules, imported by the
// components below, are appended after them (and page modules after the kit).
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "./styles/tokens.css";
import "./styles/global.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { api } from "./api/client";
import { Layout } from "./components/Layout";
import { ScrollManager } from "./components/ScrollManager";
import { AppRoutes } from "./routes/AppRoutes";
import { BackgroundJobsProvider } from "./state/backgroundJobs";
import type { User } from "./types/models";
import { ToastProvider } from "./ui";

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
      <ScrollManager />
      <ToastProvider>
        <BackgroundJobsProvider>
          <Layout user={user} onLogout={() => setUser(null)} />
          <AppRoutes user={user} isAuthLoading={isAuthLoading} onLogin={setUser} />
        </BackgroundJobsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
