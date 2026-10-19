import { DashboardSquare01Icon, HelpCircleIcon, Logout01Icon, ShieldUserIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button, ConfirmModal, Icon } from "../ui";
import { BackgroundJobsWidget } from "./BackgroundJobsWidget";
import { NotificationBell } from "./notifications/NotificationBell";
import type { User } from "../types/models";
import { stopImpersonation } from "../utils/impersonation";
import styles from "./Layout.module.css";

// Only owners open it: a separate chunk, buyers don't download it.
const HelpModal = lazy(() => import("./help/HelpModal").then((m) => ({ default: m.HelpModal })));

export function Layout({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hidePublicStoreNav = !user && location.pathname.startsWith("/m/");
  const isLoginPage = location.pathname === "/login";
  const isInDashboard = location.pathname.startsWith("/dashboard");
  const isInAdmin = location.pathname.startsWith("/admin");
  const isInAccount = location.pathname === "/account";
  const storeSlug = location.pathname.match(/^\/m\/([^/]+)/)?.[1];
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  function logout() {
    // An admin in an owner's account just goes back to the admin panel: nothing to confirm.
    if (user?.impersonatedBy) {
      stopImpersonation();
      return;
    }
    setIsLogoutConfirmOpen(true);
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
              <NavLink to="/dashboard" className={`${styles.navLink} ${styles.navIconLink}`}>
                <Icon icon={DashboardSquare01Icon} size="sm" />
                <span className={styles.navLabel}>Кабинет</span>
              </NavLink>
            )}
            {user?.role === "OWNER" && <NotificationBell />}
            {user?.role === "OWNER" && (
              <button type="button" className={`${styles.navLink} ${styles.navButton}`} onClick={() => setIsHelpOpen(true)} aria-label="Помощь">
                <Icon icon={HelpCircleIcon} size="sm" />
                <span className={styles.navLabel}>Помощь</span>
              </button>
            )}
            {user && !isInAccount && (
              <NavLink to="/account" className={`${styles.navLink} ${styles.navIconLink}`}>
                <Icon icon={UserCircleIcon} size="sm" />
                <span className={styles.navLabel}>Аккаунт</span>
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
      {isLogoutConfirmOpen && (
        <ConfirmModal
          title="Выйти из аккаунта?"
          description="Чтобы вернуться, нужно будет снова ввести логин и пароль."
          confirmLabel="Выйти"
          cancelLabel="Остаться"
          danger
          onCancel={() => setIsLogoutConfirmOpen(false)}
          onConfirm={() => {
            setIsLogoutConfirmOpen(false);
            // The session ends on that page, not here: a screen with unsaved work may ask first and stay.
            navigate("/logout");
          }}
        />
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
