import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import ShopOpenToggle from "./ShopOpenToggle";

// Every section a shop owner can reach once they have a shop. All are
// real pages except Settings, which is still a deliberate placeholder
// (see pages/ComingSoon.jsx) - listed anyway so the nav is honest about
// where the product is headed rather than only showing what happens to
// be built today.
//
// There is no separate "Recent Orders" item: it led to the same table as
// Orders, just opened on a different tab, so two nav entries competed to
// highlight for the same page. Order history is the Completed tab of
// Orders now, and /recent-orders redirects there (see App.jsx).
const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: IconDashboard },
  { label: "Orders", to: "/orders", icon: IconOrders },
  { label: "Pricing", to: "/pricing", icon: IconTag },
  // Earnings sits next to Pricing rather than under Profile: what a shop
  // charges and what it has been paid are the two money questions, and a
  // vendor checking one often wants the other. The payout DETAILS form
  // stays on Profile with KYC - that is account setup, filled in once.
  { label: "Earnings", to: "/earnings", icon: IconWallet },
  { label: "Profile", to: "/shop-profile", icon: IconUser },
  { label: "Settings", to: "/settings", icon: IconSettings },
];

// Active: light teal field, teal icon and label (the icons inherit
// currentColor), with a short teal bar on the leading edge so the current
// section is readable at a glance and not by colour alone.
const linkClass = ({ isActive }) =>
  `relative flex items-center gap-3 px-3 py-2.5 rounded-control text-sm transition-[background-color,color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
    isActive
      ? "bg-primary-wash text-primary-bright font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary"
      : "text-text-secondary font-medium hover:bg-background-soft hover:text-text-primary"
  }`;

// Persistent left column on md+ screens; collapses to a top bar with a
// dropdown panel on narrower ones, same interaction shape as the landing
// page's mobile nav (see components/landing/LandingHeader.jsx).
//
// ShopOpenToggle sits right under the shop name in both layouts, and
// outside the collapsible mobile menu specifically - it's a frequently-
// used control (a vendor flips it far more than they touch pricing or
// KYC), not a rare setting worth burying a tap away.
export default function Sidebar() {
  const { shop, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/auth/vendor");
  };

  return (
    <>
      <div className="md:hidden sticky top-0 z-20 bg-surface border-b border-border">
        <div className="h-16 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo size={28} />
            <span className="font-heading font-bold text-text-primary truncate">
              {shop ? shop.shop_name : "Paprout for Shops"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="w-10 h-10 flex items-center justify-center rounded-control text-text-primary hover:bg-background-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Always visible, not tucked inside the collapsible menu below -
            this is a frequently-used control, not a rare setting. */}
        {shop && (
          <div className="px-4 pb-3">
            <ShopOpenToggle />
          </div>
        )}

        {mobileOpen && (
          <nav className="border-t border-border px-3 py-3 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={linkClass}>
                <item.icon />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium text-text-secondary hover:bg-error-bg hover:text-error-text text-left"
            >
              <IconLogout />
              Logout
            </button>
          </nav>
        )}
      </div>

      <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0 bg-surface border-r border-border">
        <div className="border-b border-border">
          <div className="h-16 px-5 flex items-center gap-2.5">
            <Logo size={28} />
            <div className="flex flex-col min-w-0">
              <span className="font-heading font-bold text-text-primary leading-tight truncate">
                {shop ? shop.shop_name : "Paprout for Shops"}
              </span>
              {shop && <span className="text-xs text-text-muted leading-tight">Paprout for Shops</span>}
            </div>
          </div>
          {shop && (
            <div className="px-5 pb-4">
              <ShopOpenToggle />
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-medium text-text-secondary hover:bg-error-bg hover:text-error-text transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <IconLogout />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

// Shared icon frame - 18px, stroke-based, currentColor so active/hover
// states just fall out of the text colour classes above. Same visual
// language (line icons, rounded caps/joins) as EmptyQueue's icon in
// OrdersDashboard.jsx.
function IconShell({ children }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconDashboard() {
  return (
    <IconShell>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
    </IconShell>
  );
}

function IconOrders() {
  // Same receipt glyph as EmptyQueue's icon in OrdersDashboard.jsx.
  return (
    <IconShell>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </IconShell>
  );
}

function IconTag() {
  return (
    <IconShell>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </IconShell>
  );
}

function IconWallet() {
  return (
    <IconShell>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z" />
      <line x1="16" y1="13" x2="16.01" y2="13" />
    </IconShell>
  );
}

function IconUser() {
  return (
    <IconShell>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconShell>
  );
}

function IconSettings() {
  return (
    <IconShell>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.2 6.2l1.4 1.4M18.4 16.4l1.4 1.4M3 12h2M19 12h2M4.2 17.8l1.4-1.4M18.4 7.6l1.4-1.4" />
    </IconShell>
  );
}

function IconLogout() {
  return (
    <IconShell>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconShell>
  );
}
