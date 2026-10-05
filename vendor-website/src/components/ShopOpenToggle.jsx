import { useState } from "react";
import { Link } from "react-router-dom";
import ShopStatusMenu from "./ShopStatusMenu";
import { useAuth } from "../context/AuthContext";
import {
  busyPrepMinutes,
  effectiveShopStatus,
  isWithinBusinessHours,
  statusMeta,
} from "../utils/shopStatus";
import useMinuteTick from "../hooks/useMinuteTick";

// The status control shown on every dashboard page (via Sidebar) - a shop
// owner changes this far more often than they touch pricing or KYC, so it
// lives in the header rather than a settings screen.
//
// This used to be a two-state Switch. It is a button opening the shared
// ShopStatusMenu now because the states are Open / Busy / Closed, and a
// switch cannot express three - nor the preparation time Busy carries
// with it. Same menu the dashboard's Shop status card opens, so the two
// can never drift apart.
//
// The displayed status is the EFFECTIVE one: a schedule can override the
// vendor's choice, and a timed Busy expires on its own (see the backend's
// computeShopAvailability, which this mirrors).
export default function ShopOpenToggle() {
  const { shop } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // effectiveShopStatus reads the clock, so this label would otherwise go
  // stale the moment closing time passed and stay that way until an
  // unrelated re-render.
  useMinuteTick();

  if (!shop) return null;

  const status = effectiveShopStatus(shop);
  const meta = statusMeta(status);
  const scheduleEnabled = !!shop.business_hours?.enabled;
  const overridden = scheduleEnabled && !isWithinBusinessHours(shop.business_hours);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        aria-label={`Shop status: ${meta.label}. Change it.`}
        className={`flex w-full items-center gap-2 rounded-full border border-transparent px-2 py-1 text-left transition-colors duration-200 hover:border-border ${meta.chip}`}
      >
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <span className="truncate text-sm font-semibold">
          {meta.label}
          {/* The estimate is the whole point of Busy, so it rides along
              with the label rather than being a fact only the dashboard
              page knows. */}
          {status === "busy" && (
            <span className="font-normal"> · ~{busyPrepMinutes(shop)} min</span>
          )}
        </span>
      </button>

      {menuOpen && <ShopStatusMenu onClose={() => setMenuOpen(false)} />}

      {/* One compact line, not a warning block. When a schedule exists it
          always shows the hours (a vendor glancing at the sidebar should
          be able to read when they close); when that schedule is what is
          overriding their choice, the same line says so. */}
      {scheduleEnabled && (
        <p className="mt-1 text-xs tabular-nums text-text-muted">
          {shop.business_hours.open_time}–{shop.business_hours.close_time}
          {overridden && (
            <>
              {" · "}
              <span>closed now</span>{" "}
              <Link to="/pricing" className="text-primary-bright hover:underline">
                Change
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
