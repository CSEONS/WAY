import { DashboardSquare01Icon, HelpCircleIcon, Logout01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { lazy, Suspense, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button, ConfirmModal, Icon, IconButton, cx, type IconSvgElement } from "../ui";
import { BackgroundJobsWidget } from "./BackgroundJobsWidget";
import { NotificationBell } from "./notifications/NotificationBell";
import type { User } from "../types/models";
import { stopImpersonation } from "../utils/impersonation";
import styles from "./Layout.module.css";

// Only owners open it: a separate chunk, buyers don't download it.
const HelpModal = lazy(() => import("./help/HelpModal").then((m) => ({ default: m.HelpModal })));

/** A header link that is just an icon; the page it leads to is highlighted while you're there. */
function NavIcon({ to, icon, label }: { to: string; icon: IconSvgElement; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => cx(styles.navIcon, isActive && styles.navIconActive)} aria-label={label} title={label}>
      <Icon icon={icon} size="sm" />
    </NavLink>
  );
}

export function Layout({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hidePublicStoreNav = !user && location.pathname.startsWith("/m/");
  const isLoginPage = location.pathname === "/login";
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
            {/* Icons only, always all of them; the page you're on is highlighted. Names are in the tooltips.
                «Аккаунт» (login and password) is in «Разделы»: the admin's and the owner's. */}
            {user?.role === "ADMIN" && <NavIcon to="/admin" icon={ShieldUserIcon} label="Админка" />}
            {user?.role === "OWNER" && <NavIcon to="/dashboard" icon={DashboardSquare01Icon} label="Кабинет" />}
            {user?.role === "OWNER" && <NotificationBell />}
            {user?.role === "OWNER" && (
              <button
                type="button"
                className={cx(styles.navIcon, isHelpOpen && styles.navIconActive)}
                onClick={() => setIsHelpOpen(true)}
                aria-label="Помощь"
                aria-expanded={isHelpOpen}
                title="Помощь"
              >
                <Icon icon={HelpCircleIcon} size="sm" />
              </button>
            )}
            {user ? (
              <IconButton variant="danger" size="sm" icon={Logout01Icon} label="Выйти" onClick={logout} />
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
