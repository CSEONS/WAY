import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Role, User } from "../types/models";
import { LoadingState, Page } from "../ui";
import { loginUrl } from "../utils/loginRedirect";

/** Without `role` any signed-in user may enter (e.g. the account page). */
export function ProtectedRoute({ user, role, isLoading }: { user: User | null; role?: Role; isLoading: boolean }) {
  const location = useLocation();
  if (isLoading) {
    return (
      <Page>
        <LoadingState label="Проверяем сессию…" />
      </Page>
    );
  }
  // ?next= survives a reload of the login page, unlike router state.
  if (!user) return <Navigate to={loginUrl(location.pathname + location.search + location.hash)} replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
