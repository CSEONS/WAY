import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AdminPage } from "../pages/AdminPage";
import { DashboardPage } from "../pages/DashboardPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { ProductEditorPage } from "../pages/ProductEditorPage";
import { PublicProductPage } from "../pages/PublicProductPage";
import { PublicStorePage } from "../pages/PublicStorePage";
import { SettingsPage } from "../pages/SettingsPage";
import type { User } from "../types/models";

export function AppRoutes({ user, onLogin }: { user: User | null; onLogin: (user: User) => void }) {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/m/:storeSlug" element={<PublicStorePage />} />
      <Route path="/m/:storeSlug/p/:productId" element={<PublicProductPage />} />
      <Route path="/login" element={<LoginPage onLogin={onLogin} />} />
      <Route element={<ProtectedRoute user={user} role="OWNER" />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/products" element={<DashboardPage />} />
        <Route path="/dashboard/products/new" element={<ProductEditorPage />} />
        <Route path="/dashboard/products/:id/edit" element={<ProductEditorPage />} />
        <Route path="/dashboard/settings" element={<SettingsPage />} />
      </Route>
      <Route element={<ProtectedRoute user={user} role="ADMIN" />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/owners" element={<AdminPage />} />
        <Route path="/admin/owners/new" element={<AdminPage />} />
        <Route path="/admin/stores" element={<AdminPage />} />
        <Route path="/admin/stores/new" element={<AdminPage />} />
        <Route path="/admin/stores/:id/edit" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
