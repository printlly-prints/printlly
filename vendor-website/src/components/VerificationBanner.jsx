import { Link } from "react-router-dom";

// Shown at the top of the dashboard (and again on the shop profile page,
// for context while filling out the forms below it). Renders nothing once
// verification_status reaches "approved" - that's the one state a vendor
// doesn't need reminding about.
//
// Both non-approved states also mention that the shop stays hidden from
// customers meanwhile (see getActiveShops in shopController.js, which only
// ever lists approved + active shops) - this is a heads-up, not a block:
// ProtectedRoute still lets an unapproved vendor reach /dashboard so they
// can set up pricing etc. in the meantime, exactly as intended.
export default function VerificationBanner({ shop }) {
  if (!shop || shop.verification_status === "approved") return null;

  const isRejected = shop.verification_status === "rejected";

  return (
    <div
      role="status"
      className={`mb-5 rounded-panel border p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${
        isRejected ? "bg-error-bg border-error-text/20" : "bg-status-pending-bg border-status-pending-text/20"
      }`}
    >
      <div>
        <p className={`text-sm font-semibold ${isRejected ? "text-error-text" : "text-status-pending-text"}`}>
          {isRejected ? "Verification rejected" : "Pending verification"}
        </p>
        <p className={`text-sm mt-0.5 ${isRejected ? "text-error-text" : "text-status-pending-text"}`}>
          {isRejected && shop.rejection_reason ? `${shop.rejection_reason} ` : ""}
          {isRejected
            ? "Please resubmit your documents. "
            : "We're reviewing your shop details and documents. "}
          Your shop won&rsquo;t appear to customers until it&rsquo;s approved.
        </p>
      </div>

      {isRejected && (
        <Link
          to="/shop-profile"
          className="shrink-0 px-4 py-2 rounded-control bg-error text-white text-sm font-medium hover:opacity-90 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
        >
          Resubmit KYC
        </Link>
      )}
    </div>
  );
}
