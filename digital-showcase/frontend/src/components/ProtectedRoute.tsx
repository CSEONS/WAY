import { Navigate, Outlet } from "react-router-dom";
import type { Role, User } from "../types/models";
import { LoadingState, Page } from "../ui";

/** Without `role` any signed-in user may enter (e.g. the account page). */
export function ProtectedRoute({ user, role, isLoading }: { user: User | null; role?: Role; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Page>
        <LoadingState label="Проверяем сессию…" />
      </Page>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
