import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { PublicProductPage } from "../pages/PublicProductPage";
import { PublicStorePage } from "../pages/PublicStorePage";
import type { User } from "../types/models";
import { LoadingState } from "../ui";

// Buyers only need the storefront: the owner's dashboard and the admin panel
// load as separate chunks the first time someone opens them.
const DashboardPage = lazy(() => import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ProductEditorPage = lazy(() => import("../pages/ProductEditorPage").then((m) => ({ default: m.ProductEditorPage })));
const SettingsPage = lazy(() => import("../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const PosterPage = lazy(() => import("../pages/PosterPage").then((m) => ({ default: m.PosterPage })));
const AccountPage = lazy(() => import("../pages/AccountPage").then((m) => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import("../pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AdminOwnersPage = lazy(() => import("../pages/AdminOwnersPage").then((m) => ({ default: m.AdminOwnersPage })));
const AdminStoresPage = lazy(() => import("../pages/AdminStoresPage").then((m) => ({ default: m.AdminStoresPage })));
const AdminLeadsPage = lazy(() => import("../pages/AdminLeadsPage").then((m) => ({ default: m.AdminLeadsPage })));

// UI-kit catalog. `import.meta.env.DEV` is false in production builds, so the
// page and its chunk are dropped from the bundle.
const DevUiPage = import.meta.env.DEV ? lazy(() => import("../pages/DevUiPage")) : null;

export function AppRoutes({ user, isAuthLoading, onLogin }: { user: User | null; isAuthLoading: boolean; onLogin: (user: User) => void }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<LoadingState />}>
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="/m/:storeSlug" element={<PublicStorePage />} />
          <Route path="/m/:storeSlug/p/:productId" element={<PublicProductPage />} />
          <Route path="/login" element={<LoginPage onLogin={onLogin} />} />
          {DevUiPage && <Route path="/dev/ui" element={<DevUiPage />} />}
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
            <Route path="/admin/leads" element={<AdminLeadsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
