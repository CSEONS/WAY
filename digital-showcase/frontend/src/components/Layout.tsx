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
  function logout() {
    localStorage.removeItem("token");
    onLogout();
    navigate("/");
  }

  return (
    <>
      <header>
        <Link to="/">
          Витрины
        </Link>
        {!hidePublicStoreNav && (
          <nav>
            {user?.role === "ADMIN" && <NavLink to="/admin">Админка</NavLink>}
            {user?.role === "OWNER" && <NavLink to="/dashboard">Кабинет</NavLink>}
            {user ? <button onClick={logout}>Выйти</button> : <NavLink to="/login">Войти</NavLink>}
          </nav>
        )}
      </header>
    </>
  );
}
