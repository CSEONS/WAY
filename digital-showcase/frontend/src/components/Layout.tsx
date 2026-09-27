import { HelpCircleIcon, Logout01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button, Icon } from "../ui";
import { BackgroundJobsWidget } from "./BackgroundJobsWidget";
import type { User } from "../types/models";
import { stopImpersonation } from "../utils/impersonation";
import styles from "./Layout.module.css";

// Only owners open it: a separate chunk, buyers don't download it.
const HelpModal = lazy(() => import("./help/HelpModal").then((m) => ({ default: m.HelpModal })));

interface Props {
  user: User | null;
  onLogout: () => void;
}

export function Layout({ user, onLogout }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const hidePublicStoreNav = !user && location.pathname.startsWith("/m/");
  const isLoginPage = location.pathname === "/login";
  const isInDashboard = location.pathname.startsWith("/dashboard");
  const isInAdmin = location.pathname.startsWith("/admin");
  const isInAccount = location.pathname === "/account";
  const storeSlug = location.pathname.match(/^\/m\/([^/]+)/)?.[1];
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  function logout() {
    if (user?.impersonatedBy) {
      stopImpersonation();
      return;
    }
    localStorage.removeItem("token");
    onLogout();
    navigate("/");
  }

  return (
    <>
      <header className={styles.header}>
        <Link to={storeSlug ? `/m/${storeSlug}` : "/"} className={styles.brand}>
          {storeSlug ? "Главная" : "Витрины"}
        </Link>
        {!hidePublicStoreNav && (
          <nav className={styles.nav} aria-label="Основная навигация">
            {user?.role === "ADMIN" && !isInAdmin && (
              <NavLink to="/admin" className={styles.navLink}>
                Админка
              </NavLink>
            )}
            {user?.role === "OWNER" && !isInDashboard && (
              <NavLink to="/dashboard" className={styles.navLink}>
                Кабинет
              </NavLink>
            )}
            {user?.role === "OWNER" && (
              <button type="button" className={`${styles.navLink} ${styles.navButton}`} onClick={() => setIsHelpOpen(true)} aria-label="Помощь">
                <Icon icon={HelpCircleIcon} size="sm" />
                <span className={styles.navLabel}>Помощь</span>
              </button>
            )}
            {user && !isInAccount && (
              <NavLink to="/account" className={styles.navLink}>
                Аккаунт
              </NavLink>
            )}
            {user ? (
              <Button variant="danger" size="sm" icon={Logout01Icon} onClick={logout}>
                Выйти
              </Button>
            ) : (
              !isLoginPage && (
                <NavLink to="/login" className={styles.navLink}>
                  Войти
                </NavLink>
              )
            )}
          </nav>
        )}
      </header>
      {user?.impersonatedBy && (
        <div className={styles.impersonation} role="status">
          <span>
            <Icon icon={ShieldUserIcon} size="sm" />
            Вы в кабинете владельца «{user.name}». Изменения записываются в журнал.
          </span>
          <Button variant="secondary" size="sm" onClick={stopImpersonation}>
            Вернуться в админку
          </Button>
        </div>
      )}
      {isHelpOpen && (
        <Suspense fallback={null}>
          <HelpModal onClose={() => setIsHelpOpen(false)} />
        </Suspense>
      )}
      <BackgroundJobsWidget />
    </>
  );
}
