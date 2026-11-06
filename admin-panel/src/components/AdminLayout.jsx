import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useSupport } from "../context/SupportContext";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  // The only nav item that carries a count - it's the one queue where
  // something is actively waiting on an admin to act.
  { label: "Vendor Verification", to: "/verification", badgeKey: "shops_pending_verification" },
  { label: "Shops", to: "/shops" },
  { label: "Orders", to: "/orders" },
  // Sits after Orders because that is where the money it settles comes
  // from. No badge: "shops awaiting payout" is a number an admin works
  // through on their own schedule, not a queue where a customer or
  // vendor is blocked waiting on a decision, which is what the two
  // badges above mean.
  { label: "Settlements", to: "/settlements" },
  // Kept live by the support socket rather than polled - see
  // SupportContext. Counts THREADS waiting, not messages: "3" meaning
  // three people are waiting is what an admin can act on, where "3"
  // meaning one person sent three lines is not.
  { label: "Support", to: "/support", badgeKey: "support_unread_threads" },
  { label: "Settings", to: "/settings" },
];

const linkClass = ({ isActive }) =>
  `flex items-center justify-between gap-2 px-3 py-2 rounded-control text-sm font-medium transition-colors ${
    isActive
      ? "bg-primary-wash text-primary-bright"
      : "text-text-secondary hover:bg-background-soft hover:text-text-primary"
  }`;

// Shell for every authenticated page: a persistent sidebar on md+, a
// collapsible top bar below that, and the page's own content beside it.
//
// Deliberately plainer than the vendor dashboard's equivalent - no
// branding lockup, no marketing polish. This is an internal tool, so the
// nav is a list of destinations and nothing else.
export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const { unreadThreads } = useSupport() || {};
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(null);

  // The pending badge comes from the same overview endpoint the dashboard
  // renders. Fetched here (not lifted into context) because the layout is
  // the only thing that needs it, and refetched whenever a page mounts
  // would be wrong - an admin approving a shop should see the badge drop
  // without a reload, so pages that change it dispatch the event below.
  const loadPendingCount = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/stats/overview");
      setPendingCount(data.shops_pending_verification);
    } catch {
      // A failed count is not worth surfacing - the badge just doesn't
      // render, and every page still works.
      setPendingCount(null);
    }
  }, []);

  useEffect(() => {
    loadPendingCount();

    // VendorVerification dispatches this after approving/rejecting, so
    // the badge reflects the decision immediately rather than at the next
    // full page load.
    const onChanged = () => loadPendingCount();
    window.addEventListener("admin:shops-changed", onChanged);
    return () => window.removeEventListener("admin:shops-changed", onChanged);
  }, [loadPendingCount]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const badgeFor = (item) => {
    if (item.badgeKey === "shops_pending_verification") return pendingCount > 0 ? pendingCount : null;
    if (item.badgeKey === "support_unread_threads") return unreadThreads > 0 ? unreadThreads : null;
    return null;
  };

  const navLinks = (onNavigate) =>
    NAV_ITEMS.map((item) => (
      <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass} onClick={onNavigate}>
        <span>{item.label}</span>
        {badgeFor(item) !== null && (
          <span className="min-w-[1.4rem] px-1.5 py-0.5 rounded-full bg-primary text-white text-xs font-semibold text-center">
            {badgeFor(item)}
          </span>
        )}
      </NavLink>
    ));

  return (
    <div className="min-h-screen md:flex bg-background">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-20 bg-surface border-b border-border">
        <div className="h-14 px-4 flex items-center justify-between">
          <span className="font-heading font-bold text-text-primary">Paprout Admin</span>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="w-9 h-9 flex items-center justify-center rounded-control text-text-primary hover:bg-background-soft"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {mobileOpen && (
          <nav className="border-t border-border px-3 py-3 flex flex-col gap-1">
            {navLinks(() => setMobileOpen(false))}
            <button
              onClick={handleLogout}
              className="mt-2 px-3 py-2 rounded-control text-sm font-medium text-text-secondary hover:bg-error-bg hover:text-error-text text-left"
            >
              Logout
            </button>
          </nav>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:h-screen md:sticky md:top-0 bg-surface border-r border-border">
        <div className="h-14 px-5 flex items-center border-b border-border">
          <span className="font-heading font-bold text-text-primary">Paprout Admin</span>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">{navLinks()}</nav>

        <div className="px-3 py-4 border-t border-border">
          {user?.email && <p className="px-3 pb-2 text-xs text-text-muted truncate">{user.email}</p>}
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-control text-sm font-medium text-text-secondary hover:bg-error-bg hover:text-error-text text-left"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 px-4 py-6 sm:px-6 md:px-8">{children}</div>
    </div>
  );
}
