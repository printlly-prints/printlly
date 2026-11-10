import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ShopSessionCheck() {
  const { shopError, refreshShop } = useAuth();
  return shopError ? (
    <div className="space-y-3 p-8 text-center text-text-secondary">
      <p role="alert">Could not load your shop. Check your connection and try again.</p>
      <button type="button" onClick={() => refreshShop()} className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-white">
        Retry
      </button>
    </div>
  ) : (
    <div role="status" className="p-8 text-center text-text-secondary">Loading your shop…</div>
  );
}

// Guards a route behind login, and optionally behind "shop already
// registered" too (requireShop). Used to keep redirect logic out of
// individual page components.
//
// Every protected route in this app is vendor-only (customers use the
// mobile app, not this site), so an unauthenticated visitor is sent
// straight to the vendor login form rather than the customer/vendor
// chooser at "/auth" - there's no ambiguity left to resolve.
export default function ProtectedRoute({ children, requireShop = false }) {
  const { isAuthenticated, shop, shopLoading, shopError } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/auth/vendor" replace />;
  }

  if (requireShop) {
    if (shopLoading || shopError) return <ShopSessionCheck />;
    if (!shop) {
      return <Navigate to="/register-shop" replace />;
    }
  }

  return children;
}
