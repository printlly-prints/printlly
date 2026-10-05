import { useEffect, useRef, useState } from "react";
import StatusBadge from "./StatusBadge";
import { orderRef } from "../utils/orderRef";

// One grid template, exported, so the header and every row are laid out
// by the same string. Two copies of a column list is how a table's
// header stops lining up with its body.
export const ORDER_GRID =
  "grid grid-cols-[minmax(170px,1.6fr)_96px_minmax(120px,1fr)_minmax(190px,1.7fr)_72px_96px_128px_150px] gap-3 items-center";

// Initials, not a photo: User has name/phone/email and no avatar field,
// so a broken <img> is the only other honest option.
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Compact date: a queue is scanned, not read. Same-day orders show the
// time (which is what a vendor actually needs), older ones show the date.
function placedOn(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  return sameDay
    ? `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : date.toLocaleDateString([], { day: "2-digit", month: "short", year: "2-digit" });
}

// The print-type tags for the whole order, de-duplicated. A row is a
// summary - if three files are all A4 B&W, that is one "B&W" chip and one
// "A4" chip, not six. The per-document detail stays in the drawer, which
// is where a vendor goes before actually printing.
//
// Colour and finishing services lead, because those are the settings that
// cost real money to get wrong.
export function orderTags(order) {
  const seen = new Map();
  const add = (label, tone) => {
    if (label && !seen.has(label)) seen.set(label, tone);
  };

  for (const doc of order.documents || []) {
    if (doc.color_mode === "color") add("Color", "loud");
  }
  for (const doc of order.documents || []) {
    for (const service of doc.services || []) add(service.name, "service");
  }
  for (const doc of order.documents || []) {
    if (doc.color_mode === "bw") add("B&W", "quiet");
    add(doc.paper_size || "A4", doc.paper_size === "A3" ? "loud" : "quiet");
    if (doc.sides === "double") add("Double-sided", "loud");
  }

  return [...seen].map(([label, tone]) => ({ label, tone }));
}

const TAG_TONE = {
  loud: "bg-primary-wash text-primary-deep font-semibold",
  service: "bg-success-bg text-success-text font-semibold",
  quiet: "bg-background-tint text-text-secondary",
};

// The one status-changing action available on this row, if any. Completing
// needs a 6-digit OTP typed in, so it opens the detail panel rather than
// firing from a menu item.
function primaryAction(status) {
  if (status === "pending") return { key: "accept", label: "Accept order" };
  if (status === "accepted") return { key: "ready", label: "Mark ready" };
  if (status === "ready_for_pickup") return { key: "complete", label: "Verify OTP & complete" };
  return null;
}

export default function OrderRow({ order, zebra, onView, onViewPrint, onAccept, onReady, busy }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on an outside click or Escape - a menu that only closes by
  // re-clicking its own button is the classic dashboard annoyance.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const customer = order.customer_id || {};
  const docCount = order.documents?.length ?? 0;
  const isExpired = order.status === "expired";
  const tags = isExpired ? [] : orderTags(order);
  const pages = (order.documents || []).reduce((sum, d) => sum + (d.page_count || 0), 0);
  const copies = (order.documents || []).reduce((sum, d) => sum + (d.copies || 1), 0);
  const action = primaryAction(order.status);

  const runAction = () => {
    setMenuOpen(false);
    if (action?.key === "accept") onAccept(order._id);
    else if (action?.key === "ready") onReady(order._id);
    else if (action?.key === "complete") onView(order, { completing: true });
  };

  return (
    <div
      className={`${ORDER_GRID} px-4 py-3 rounded-card border border-border transition-[background-color,box-shadow,border-color] duration-[190ms] hover:bg-primary-wash/60 hover:border-primary/30 hover:shadow-card ${
        zebra ? "bg-background-soft/50" : "bg-surface"
      } ${busy ? "opacity-60" : ""}`}
    >
      {/* Customer */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full bg-primary-wash text-primary-deep font-heading text-xs font-bold grid place-items-center"
        >
          {initials(customer.name)}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary truncate">
            {customer.name || "Unknown customer"}
          </span>
          <span className="block text-xs text-text-muted truncate">{customer.phone || "—"}</span>
        </span>
      </div>

      {/* Order ID - the derived short ref, with the full id on hover for
          anyone cross-checking against the database or a support thread. */}
      <span
        className="text-xs font-semibold tabular-nums text-text-secondary truncate"
        title={String(order._id)}
      >
        {orderRef(order)}
      </span>

      {/* Placed on */}
      <span className="text-xs text-text-secondary truncate" title={new Date(order.createdAt).toLocaleString()}>
        {placedOn(order.createdAt)}
      </span>

      {/* Documents */}
      <div className="min-w-0">
        <span className="block text-xs font-medium text-text-primary">
          {docCount} file{docCount === 1 ? "" : "s"}
        </span>
        <span className="flex flex-wrap gap-1 mt-1">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag.label} className={`text-[11px] px-2 py-0.5 rounded-full ${TAG_TONE[tag.tone]}`}>
              {tag.label}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-background-tint text-text-muted">
              +{tags.length - 3}
            </span>
          )}
        </span>
      </div>

      {/* Pages - sheets before copies, with the copy count only when it
          would change the number, so "12" never quietly means 36. */}
      <span className="text-sm tabular-nums text-text-primary">
        {isExpired ? "—" : pages}
        {!isExpired && copies > docCount && (
          <span className="block text-[11px] text-text-muted tabular-nums">×{copies} copies</span>
        )}
      </span>

      {/* Amount - stored server-side; nothing is recalculated here. */}
      <span className="text-sm font-bold tabular-nums text-text-primary">₹{order.total_amount ?? 0}</span>

      <StatusBadge status={order.status} />

      {/* Action */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onView(order)}
          className="px-2.5 h-8 rounded-control text-xs font-semibold text-text-secondary hover:text-primary-bright hover:bg-primary-wash transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          View
        </button>
        {!isExpired && docCount > 0 && (
          <button
            type="button"
            onClick={() => onViewPrint(order)}
            className="px-2.5 h-8 rounded-control text-xs font-semibold text-primary-bright bg-primary-wash hover:bg-primary hover:text-white transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            View &amp; print
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for order ${orderRef(order)}`}
            className="w-8 h-8 rounded-control text-text-muted hover:text-text-primary hover:bg-background-tint transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 z-20 w-52 bg-surface border border-border rounded-card shadow-dropdown py-1 text-left"
            >
              {action && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={runAction}
                  className="w-full text-left px-3 py-2 text-sm font-semibold text-primary-bright hover:bg-primary-wash disabled:opacity-50"
                >
                  {busy ? "Working…" : action.label}
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onView(order);
                }}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-background-soft"
              >
                Order details
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  navigator.clipboard?.writeText(String(order._id));
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-background-soft"
              >
                Copy full order ID
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
