import { LogOut } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import type { User } from "../types/models";

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
  function logout() {
    localStorage.removeItem("token");
    onLogout();
    navigate("/");
  }

  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          Витрины
        </Link>
        {!hidePublicStoreNav && (
          <nav>
            {user?.role === "ADMIN" && !isInAdmin && <NavLink to="/admin">Админка</NavLink>}
            {user?.role === "OWNER" && !isInDashboard && <NavLink to="/dashboard">Кабинет</NavLink>}
            {user ? (
              <button type="button" className="btn btn-danger btn-sm" onClick={logout}>
                <LogOut size={16} strokeWidth={2} />
                Выйти
              </button>
            ) : (
              !isLoginPage && <NavLink to="/login">Войти</NavLink>
            )}
          </nav>
        )}
      </header>
    </>
  );
}

