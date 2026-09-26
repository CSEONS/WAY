import { Logout01Icon } from "@hugeicons/core-free-icons";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../ui";
import { BackgroundJobsWidget } from "./BackgroundJobsWidget";
import type { User } from "../types/models";
import styles from "./Layout.module.css";

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
  function logout() {
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
      <BackgroundJobsWidget />
    </>
  );
}
