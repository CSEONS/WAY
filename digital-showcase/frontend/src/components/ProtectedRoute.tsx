import { Navigate, Outlet } from "react-router-dom";
import type { Role, User } from "../types/models";

export function ProtectedRoute({ user, role }: { user: User | null; role: Role }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
