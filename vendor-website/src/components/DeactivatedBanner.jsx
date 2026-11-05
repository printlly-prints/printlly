import { useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Shown across EVERY dashboard page (wired into DashboardLayout, not just
// one screen) while the shop is deactivated (is_active false) - a much
// stronger, non-dismissible statement than VerificationBanner's pending/
// rejected notice, since a deactivated shop hasn't just failed to be
// approved yet, it's been deliberately taken off the platform (see
// deactivateMyShop's own comment in shopController.js on how this
// differs from the short-term Open/Closed toggle).
//
// Deliberately does NOT hide the page below it - orders already placed
// still need to be completed (the confirmation dialog a vendor sees
// before deactivating says exactly that, see ShopProfile.jsx), so Orders
// in particular has to stay fully usable even while this banner is up.
export default function DeactivatedBanner() {
  const { shop, refreshShop } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!shop || shop.is_active) return null;

  // An admin takedown can't be self-reversed (the backend returns 403), so
  // no button is offered - only a way to reach support.
  const byAdmin = shop.deactivated_by === "admin";

  const handleReactivate = async () => {
    setError("");
    setLoading(true);
    try {
      await api.patch("/shops/me/reactivate");
      await refreshShop();
    } catch (err) {
      setError(err.response?.data?.message || "Could not reactivate your shop. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div role="alert" className="bg-error-bg text-error-text">
      <div className="px-4 sm:px-6 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {byAdmin
              ? "Your shop was deactivated by an administrator and is not visible to customers."
              : "Your shop is deactivated and not visible to customers."}
          </p>
          {byAdmin && (
            <p className="text-sm mt-1 text-error-text">
              You can&rsquo;t reactivate it yourself. Please contact support to review the decision. Orders
              already placed can still be completed.
            </p>
          )}
          {error && <p className="text-sm mt-1 text-error-text">{error}</p>}
        </div>
        {!byAdmin && (
          <button
            type="button"
            onClick={handleReactivate}
            disabled={loading}
            className="shrink-0 px-4 min-h-12 rounded-control bg-primary text-white text-sm font-semibold hover:bg-primary-deep disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {loading ? "Reactivating..." : "Reactivate my shop"}
          </button>
        )}
      </div>
    </div>
  );
}
