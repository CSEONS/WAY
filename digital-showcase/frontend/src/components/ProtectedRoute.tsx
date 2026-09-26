import { Navigate, Outlet } from "react-router-dom";
import type { Role, User } from "../types/models";
import { LoadingState, Page } from "../ui";

export function ProtectedRoute({ user, role, isLoading }: { user: User | null; role: Role; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Page>
        <LoadingState label="Проверяем сессию…" />
      </Page>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
