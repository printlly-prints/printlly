import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PublicShell from "./PublicShell";
import MascotRecovery from "./MascotRecovery";

// Guards a route behind login, and optionally behind "shop already
// registered" too (requireShop). Used to keep redirect logic out of
// individual page components.
//
// Every protected route in this app is vendor-only (customers use the
// mobile app, not this site), so an unauthenticated visitor is sent
// straight to the vendor login form rather than the customer/vendor
// chooser at "/auth" - there's no ambiguity left to resolve.
export default function ProtectedRoute({ children, requireShop = false }) {
  const { isAuthenticated, shop, shopLoading, shopError, shopRequestError, refreshShop } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/auth/vendor" replace />;
  }

  if (requireShop) {
    if (shopLoading) {
      return <div className="p-8 text-center text-text-secondary">Loading...</div>;
    }
    if (shopError) return <PublicShell footer={false}><div className="recovery-page"><MascotRecovery error={shopRequestError} onRetry={refreshShop} /></div></PublicShell>;
    if (!shop) {
      return <Navigate to="/register-shop" replace />;
    }
  }

  return children;
}
