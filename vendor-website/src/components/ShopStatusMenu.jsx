import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import {
  SHOP_STATUSES,
  busyPrepMinutes,
  effectiveShopStatus,
  isWithinBusinessHours,
} from "../utils/shopStatus";

// The one place a vendor changes how their shop is trading. Rendered by
// both the dashboard's Shop status card and the compact indicator in the
// sidebar, so there is a single control behind both and they can never
// offer different options or write different fields.
//
// Busy is the reason this replaced a two-state switch: it is a normal
// trading state, not a degraded one. A busy shop keeps taking orders -
// all that changes is the estimate customers are shown.

const PREP_PRESETS = [15, 20, 25, 30, 45, 60];

// null is "Until I turn it off" - the default, and the only Busy that
// does not expire by itself. The backend turns `minutes` into busy_until
// so a wrong clock on this machine can't set an expiry in the past.
const DURATIONS = [
  { minutes: null, label: "Until I turn it off" },
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
];

export default function ShopStatusMenu({ onClose }) {
  const { shop, refreshShop } = useAuth();
  const panelRef = useRef(null);

  const current = effectiveShopStatus(shop);
  const [choice, setChoice] = useState(current);
  const [prep, setPrep] = useState(busyPrepMinutes(shop));
  // Only used while the custom field is open, so switching back to a
  // preset doesn't have to clear it.
  const [customOpen, setCustomOpen] = useState(!PREP_PRESETS.includes(busyPrepMinutes(shop)));
  const [duration, setDuration] = useState(shop?.busy_until ? 30 : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Escape and outside-click close, matching the order menus elsewhere in
  // this dashboard.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  // A schedule that has already closed the shop overrides whatever is
  // picked here, so saying so up front is kinder than letting a vendor
  // choose Open and watch nothing happen.
  const overridden = !!shop?.business_hours?.enabled && !isWithinBusinessHours(shop.business_hours);

  const save = async () => {
    if (saving) return;
    const minutes = Number(prep);
    if (choice === "busy" && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) {
      setError("Preparation time must be a whole number of minutes, 1 to 240.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.patch("/shops/me/status", {
        shop_status: choice,
        // Sent only for Busy: the backend clears both when leaving it, so
        // sending them for Open would be meaningless at best.
        ...(choice === "busy" ? { busy_prep_minutes: minutes, busy_for_minutes: duration } : {}),
      });
      await refreshShop();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update your status.");
      setSaving(false);
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Change shop status"
      className="absolute right-0 top-full z-30 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-panel border border-border-strong bg-surface-raised p-3 shadow-dropdown"
    >
      <div className="space-y-1.5">
        {SHOP_STATUSES.map((s) => {
          const active = choice === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setChoice(s.value)}
              aria-pressed={active}
              className={`flex w-full items-start gap-2.5 rounded-control border p-2.5 text-left transition-colors duration-200 ${
                active ? `${s.ring} bg-primary-wash/40` : "border-border hover:bg-background-page"
              }`}
            >
              <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
              <span className="min-w-0">
                <span className={`block font-heading text-sm font-bold ${s.text}`}>{s.label}</span>
                <span className="block text-xs text-text-secondary">{s.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Busy settings appear only once Busy is the choice - they are
          meaningless for the other two, and the backend clears them. */}
      {choice === "busy" && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Expected preparation time
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PREP_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setPrep(m);
                    setCustomOpen(false);
                  }}
                  aria-pressed={!customOpen && prep === m}
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors duration-200 ${
                    !customOpen && prep === m
                      ? "border-busy bg-busy-bg font-semibold text-busy-text"
                      : "border-border text-text-secondary hover:bg-background-page"
                  }`}
                >
                  {m} min
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                aria-pressed={customOpen}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ${
                  customOpen
                    ? "border-busy bg-busy-bg font-semibold text-busy-text"
                    : "border-border text-text-secondary hover:bg-background-page"
                }`}
              >
                Custom
              </button>
            </div>
            {customOpen && (
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={prep}
                  onChange={(e) => setPrep(e.target.value)}
                  aria-label="Custom preparation time in minutes"
                  className="h-9 w-24 rounded-control border border-border px-2 text-sm tabular-nums focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-text-secondary">minutes</span>
              </label>
            )}
          </div>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Busy until</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={String(d.minutes)}
                  type="button"
                  onClick={() => setDuration(d.minutes)}
                  aria-pressed={duration === d.minutes}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-200 ${
                    duration === d.minutes
                      ? "border-busy bg-busy-bg font-semibold text-busy-text"
                      : "border-border text-text-secondary hover:bg-background-page"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-text-secondary">
            You keep receiving orders while busy. Customers just see a longer estimate.
          </p>
        </div>
      )}

      {overridden && choice !== "closed" && (
        <p className="mt-3 text-xs text-text-muted">
          Your shop is outside its opening hours, so it stays closed to customers until{" "}
          <span className="tabular-nums">{shop.business_hours.open_time}</span>.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-error-text">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-background-page"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-control bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-deep disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save status"}
        </button>
      </div>
    </div>
  );
}
