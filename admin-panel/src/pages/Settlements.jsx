import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import { ErrorNote, Loading, PageHeader, TableShell, Td, Tr, formatRupees } from "../components/ui";

// Who is owed money, worst wait first.
//
// NOTHING ON THIS PAGE MOVES MONEY. The transfer is a UPI or bank payment
// an admin makes themselves, outside this platform; these screens record
// that it happened. The copy is deliberate about that everywhere, because
// a button labelled "settle" in a payments UI usually means "pay now",
// and here it does not.
//
// The backend already sorts oldest-pending-first (see
// controllers/settlementController.js) - that order is not re-derived
// here, so the two can't disagree about whose wait is longest.

// A vendor waiting longer than this is flagged. Hardcoded on purpose for
// now: there is no settlement-policy setting anywhere in this system yet,
// and inventing a Settings field for one threshold would be more surface
// than the rule is worth. It lives here, named, so it is one edit when
// that changes.
const OVERDUE_DAYS = 7;

export default function Settlements() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/settlements/pending");
      setRows(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load pending settlements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalOwed = rows.reduce((sum, r) => sum + (r.total_unsettled_amount || 0), 0);
  const overdueCount = rows.filter((r) => daysSince(r.oldest_unsettled_at) >= OVERDUE_DAYS).length;

  return (
    <AdminLayout>
      <PageHeader
        title="Settlements"
        description="Vendors with money owed. Transfers are made by hand — this records them."
      />

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <Stat label="Shops awaiting payout" value={rows.length} />
          <Stat label="Total owed" value={formatRupees(totalOwed)} />
          {overdueCount > 0 && (
            <Stat
              label={`Waiting over ${OVERDUE_DAYS} days`}
              value={overdueCount}
              tone="bg-status-pending-bg border-status-pending-text/20"
            />
          )}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading pending settlements..." />
      ) : (
        <TableShell
          headers={["Shop", "Owner", "Orders", "Amount owed", "Waiting", ""]}
          empty={
            rows.length === 0
              ? "Nothing is owed right now — every completed order has been settled."
              : null
          }
        >
          {rows.map((row) => {
            const days = daysSince(row.oldest_unsettled_at);
            const overdue = days >= OVERDUE_DAYS;
            return (
              <Tr key={row.shop_id}>
                <Td>
                  <Link
                    to={`/settlements/${row.shop_id}`}
                    className="font-medium text-primary-bright hover:text-primary-deep"
                  >
                    {row.shop_name}
                  </Link>
                </Td>
                <Td>
                  <div className="text-text-primary">{row.owner_name || "—"}</div>
                  <div className="text-xs text-text-muted">{row.owner_email || "—"}</div>
                </Td>
                <Td className="tabular-nums text-text-secondary">{row.unsettled_order_count}</Td>
                <Td className="tabular-nums font-semibold text-text-primary whitespace-nowrap">
                  {formatRupees(row.total_unsettled_amount)}
                </Td>
                <Td className="whitespace-nowrap">
                  {/* The badge is not the only signal - the text says the
                      same thing, so this reads without colour vision. */}
                  {overdue ? (
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-pending-bg text-status-pending-text">
                      {describeWait(days)}
                    </span>
                  ) : (
                    <span className="text-text-secondary">{describeWait(days)}</span>
                  )}
                </Td>
                <Td className="text-right">
                  <Link
                    to={`/settlements/${row.shop_id}`}
                    className="inline-block px-3 py-1.5 rounded-control bg-primary text-white text-sm font-medium whitespace-nowrap hover:bg-primary-deep"
                  >
                    Review
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </TableShell>
      )}
    </AdminLayout>
  );
}

function Stat({ label, value, tone = "bg-surface border-border" }) {
  return (
    <div className={`px-4 py-3 rounded-panel border ${tone}`}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="font-heading text-lg font-bold text-text-primary tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

// Whole days, floored: an order from 20 hours ago has not been waiting
// "1 day", and rounding up would make a same-day order look overdue
// sooner than it is.
export function daysSince(value) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

export function describeWait(days) {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
