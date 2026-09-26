import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AccountPage } from "../pages/AccountPage";
import { AdminPage } from "../pages/AdminPage";
import { AdminOwnersPage } from "../pages/AdminOwnersPage";
import { AdminStoresPage } from "../pages/AdminStoresPage";
import { DashboardPage } from "../pages/DashboardPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { PosterPage } from "../pages/PosterPage";
import { ProductEditorPage } from "../pages/ProductEditorPage";
import { PublicProductPage } from "../pages/PublicProductPage";
import { PublicStorePage } from "../pages/PublicStorePage";
import { SettingsPage } from "../pages/SettingsPage";
import type { User } from "../types/models";
import { LoadingState } from "../ui";

// UI-kit catalog. `import.meta.env.DEV` is false in production builds, so the
// page and its chunk are dropped from the bundle.
const DevUiPage = import.meta.env.DEV ? lazy(() => import("../pages/DevUiPage")) : null;

export function AppRoutes({ user, isAuthLoading, onLogin }: { user: User | null; isAuthLoading: boolean; onLogin: (user: User) => void }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
      <Route index element={<HomePage />} />
      <Route path="/m/:storeSlug" element={<PublicStorePage />} />
      <Route path="/m/:storeSlug/p/:productId" element={<PublicProductPage />} />
      <Route path="/login" element={<LoginPage onLogin={onLogin} />} />
      {DevUiPage && (
        <Route
          path="/dev/ui"
          element={
            <Suspense fallback={<LoadingState />}>
              <DevUiPage />
            </Suspense>
          }
        />
      )}
      <Route element={<ProtectedRoute user={user} role="OWNER" isLoading={isAuthLoading} />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/stores/:storeId" element={<DashboardPage />} />
        <Route path="/dashboard/stores/:storeId/products" element={<DashboardPage />} />
        <Route path="/dashboard/stores/:storeId/products/new" element={<ProductEditorPage />} />
        <Route path="/dashboard/stores/:storeId/products/:id/edit" element={<ProductEditorPage />} />
        <Route path="/dashboard/stores/:storeId/settings" element={<SettingsPage />} />
        <Route path="/dashboard/stores/:storeId/poster" element={<PosterPage />} />
      </Route>
      <Route element={<ProtectedRoute user={user} isLoading={isAuthLoading} />}>
        <Route path="/account" element={<AccountPage user={user} />} />
      </Route>
      <Route element={<ProtectedRoute user={user} role="ADMIN" isLoading={isAuthLoading} />}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/owners" element={<AdminOwnersPage />} />
        <Route path="/admin/owners/new" element={<AdminOwnersPage />} />
        <Route path="/admin/stores" element={<AdminStoresPage />} />
        <Route path="/admin/stores/new" element={<AdminStoresPage />} />
        <Route path="/admin/stores/:id/edit" element={<AdminStoresPage />} />
      </Route>
      </Routes>
    </ErrorBoundary>
  );
}
