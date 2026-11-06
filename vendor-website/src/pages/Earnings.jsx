import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import Panel, { PanelHeader, EmptyNote } from "../components/dashboard/Panel";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { formatRupees, hasPayoutDetails } from "../utils/payout";

// "What am I owed, and what have I already been paid?"
//
// Reads GET /shops/me/settlements, which is scoped to the logged-in
// owner's own shop - no shop id is sent or accepted, so there is nothing
// here that could show another vendor's earnings.
//
// A settlement is a transfer an admin makes BY HAND (UPI or bank) outside
// this platform, recorded afterwards. Nothing on this page moves money or
// requests a payout, and the copy deliberately never implies it does.
export default function Earnings() {
  const { shop } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/shops/me/settlements");
      setData(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const payoutReady = hasPayoutDetails(shop);
  const unsettled = data?.unsettled;
  const settlements = data?.settlements || [];

  return (
    <DashboardLayout>
      {/* max-w-7xl, the same container Dashboard, Orders, Pricing and
          Profile use, so this page's left edge lines up with theirs. */}
      <div className="max-w-7xl mx-auto flex flex-col gap-4 motion-safe:animate-[printlly-rise_300ms_ease-out]">
        <header>
          <h1 className="font-heading text-2xl font-bold text-text-primary">Earnings</h1>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">
            What you've earned on completed orders, and what has already been paid out to you.
          </p>
        </header>

        {/* Nothing can be sent without somewhere to send it, so this sits
            above the balance rather than below the table - a vendor
            should meet it before they start wondering why the money
            hasn't arrived. */}
        {!payoutReady && (
          <div className="rounded-panel border border-busy/40 bg-busy-bg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-busy-text">Add your payout details</h2>
              <p className="text-xs text-text-secondary mt-0.5 max-w-xl">
                We can't send your earnings until we know where to send them. Your balance keeps
                building in the meantime — nothing is lost.
              </p>
            </div>
            <Link
              to="/shop-profile#payout"
              className="shrink-0 px-4 h-10 inline-flex items-center rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Add payout details
            </Link>
          </div>
        )}

        {error && (
          <Panel className="p-5">
            <p className="text-sm text-error-text">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 px-4 h-9 rounded-control border border-border text-sm font-medium text-text-primary hover:border-primary hover:text-primary-bright transition-colors duration-200"
            >
              Try again
            </button>
          </Panel>
        )}

        {/* --- the balance ------------------------------------------- */}
        <Panel className="p-5 sm:p-6">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Unsettled balance
          </p>
          {loading ? (
            <div className="mt-2 h-10 w-40 rounded-control bg-background-soft animate-pulse" />
          ) : (
            <>
              <p className="mt-1 font-heading text-4xl font-extrabold text-text-primary tabular-nums">
                {formatRupees(unsettled?.total_amount)}
              </p>
              <p className="text-sm text-text-secondary mt-1.5">
                {unsettled?.order_count
                  ? `From ${unsettled.order_count} completed order${
                      unsettled.order_count === 1 ? "" : "s"
                    }`
                  : "No completed orders waiting to be paid out"}
                {unsettled?.oldest_order_at && (
                  <>
                    {" · oldest from "}
                    <span className="tabular-nums">{formatDate(unsettled.oldest_order_at)}</span>
                  </>
                )}
              </p>
              {/* Said once, here, because "unsettled balance" otherwise
                  reads like a button is missing. */}
              <p className="text-xs text-text-muted mt-3 max-w-xl">
                This is your share of completed, paid orders — the order total minus Paprout's fee.
                Payouts are sent manually, so there's nothing to request; this clears once a transfer
                has been made.
              </p>
            </>
          )}
        </Panel>

        {/* --- what has been paid ----------------------------------- */}
        <Panel className="p-5">
          <PanelHeader
            title="Payout history"
            subtitle={
              settlements.length
                ? `${settlements.length} payout${settlements.length === 1 ? "" : "s"} so far`
                : undefined
            }
          />

          <div className="mt-4">
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 rounded-card bg-background-soft animate-pulse" />
                ))}
              </div>
            ) : settlements.length === 0 ? (
              <EmptyNote
                icon={<IconReceipt />}
                title="No payouts yet"
                hint="Once we've sent you a payment, it'll be listed here with its reference."
              />
            ) : (
              // A real <table>, not a grid of divs: this is tabular data a
              // vendor may well be reconciling against a bank statement
              // row by row, and a screen reader should be able to say
              // which column a cell is in.
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      <th scope="col" className="pb-2 pr-4 font-medium">Date</th>
                      <th scope="col" className="pb-2 pr-4 font-medium">Amount</th>
                      <th scope="col" className="pb-2 pr-4 font-medium">Orders</th>
                      <th scope="col" className="pb-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((row) => (
                      <tr key={row._id} className="border-t border-border">
                        <td className="py-3 pr-4 text-text-primary tabular-nums whitespace-nowrap">
                          {formatDate(row.settled_at)}
                        </td>
                        <td className="py-3 pr-4 font-semibold text-text-primary tabular-nums whitespace-nowrap">
                          {formatRupees(row.total_amount)}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary tabular-nums whitespace-nowrap">
                          {row.order_count}
                        </td>
                        {/* The reference is what a vendor matches against
                            their statement, so it keeps its exact
                            characters - monospace-ish spacing, never
                            truncated with an ellipsis. */}
                        <td className="py-3 text-text-secondary break-all">
                          {row.reference_note || <span className="text-text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>

        {/* A quiet way back to the details, for a vendor who has already
            filled them in and wants to change a bank account. The banner
            above covers the empty case; this covers the rest. */}
        {payoutReady && (
          <Link
            to="/shop-profile#payout"
            className="self-start text-sm font-medium text-primary-bright hover:text-primary-deep"
          >
            Update payout details →
          </Link>
        )}
      </div>
    </DashboardLayout>
  );
}

// Short and unambiguous - "3 Sep 2026", never 03/09 which reads as March
// to half the world.
function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function IconReceipt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2V3Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
