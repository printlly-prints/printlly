import { useState } from "react";
import { Link } from "react-router-dom";
import Panel from "./Panel";
import ShopStatusMenu from "../ShopStatusMenu";
import { useAuth } from "../../context/AuthContext";
import {
  busyPrepMinutes,
  effectiveShopStatus,
  isWithinBusinessHours,
  statusMeta,
} from "../../utils/shopStatus";
import useMinuteTick from "../../hooks/useMinuteTick";

// "What is my shop doing right now?" - the question a vendor asks this
// dashboard most often, answered in a line and changed in a tap.
//
// Three states, not two: Busy sits between Open and Closed and is an
// ORDERING state, not a stopped one - customers keep ordering, they just
// see a longer estimate. That is why it is amber here and never red.
//
// The schedule can still override the vendor's choice (the backend's
// computeShopAvailability decides, not this card), so when it does, one
// compact line says which hours are doing it and where to change them -
// rather than the large warning block that used to occupy this space.
export default function ShopStatusCard() {
  const { shop } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // effectiveShopStatus reads the clock - a timed Busy lapsing, or a
  // closing time passing, would otherwise leave this card stale until an
  // unrelated re-render.
  useMinuteTick();

  if (!shop) return null;

  const status = effectiveShopStatus(shop);
  const meta = statusMeta(status);
  const scheduleEnabled = !!shop.business_hours?.enabled;
  const overridden = scheduleEnabled && !isWithinBusinessHours(shop.business_hours);

  return (
    <Panel className="p-4">
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading font-bold text-text-primary">Shop status</h2>
          <p className="mt-1.5 flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            <span className={`font-heading font-bold ${meta.text}`}>{meta.label}</span>
          </p>
          <p className="text-xs text-text-secondary">{meta.description}</p>

          {/* While busy, the estimate IS the status - it is the whole
              difference a customer sees, so it is stated here rather
              than hidden behind the menu. */}
          {status === "busy" && (
            <p className="mt-1.5 text-xs font-medium text-busy-text">
              Customers see: ready in ~{busyPrepMinutes(shop)} min
              {shop.busy_until && (
                <>
                  {" · until "}
                  <span className="tabular-nums">
                    {new Date(shop.busy_until).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          className="shrink-0 rounded-control border border-border px-3 py-1.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:border-primary hover:text-primary-bright"
        >
          Change status
        </button>

        {menuOpen && <ShopStatusMenu onClose={() => setMenuOpen(false)} />}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[11px] font-medium text-text-muted">Today's hours</p>
        {scheduleEnabled ? (
          <p className="text-sm tabular-nums text-text-primary">
            {shop.business_hours.open_time} – {shop.business_hours.close_time}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            No schedule — you open and close manually.{" "}
            <Link to="/pricing" className="text-primary-bright hover:underline">
              Set hours
            </Link>
          </p>
        )}

        {/* One line, not a block: a status that has no effect right now
            needs explaining, but it does not need a quarter of the card. */}
        {overridden && (
          <p className="mt-1.5 text-xs text-text-muted">
            Outside these hours, so your shop stays closed to customers.{" "}
            <Link to="/pricing" className="text-primary-bright hover:underline">
              Change hours
            </Link>
          </p>
        )}
      </div>
    </Panel>
  );
}
