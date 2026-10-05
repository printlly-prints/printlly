import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";

// Top bar for the shop-registration flow only, before a shop exists (or
// its own read-only fallback view) - every other authenticated page uses
// Sidebar/DashboardLayout instead, which carries its own logout control.
export default function Navbar() {
  const { shop, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/auth/vendor");
  };

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={30} />
          <div className="flex flex-col min-w-0">
            <span className="font-heading font-bold text-text-primary leading-tight truncate">
              {shop ? shop.shop_name : "Printlly for Shops"}
            </span>
            {shop && <span className="text-xs text-text-muted leading-tight">Printlly for Shops</span>}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm font-medium text-text-secondary hover:text-error rounded-control px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
