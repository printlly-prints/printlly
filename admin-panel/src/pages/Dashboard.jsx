import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import { ErrorNote, Loading, PageHeader, formatRupees } from "../components/ui";

// The overview stats as plain number cards. No charts, deliberately -
// every figure here is a single current value, and a chart of one number
// is decoration. Trends would need history the backend doesn't record.
export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/admin/stats/overview");
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Could not load platform stats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout>
      <PageHeader title="Dashboard" description="Platform-wide totals, current as of this page load." />

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading stats..." />
      ) : stats ? (
        <>
          {/* Pending verification leads and is a link, not just a number -
              it's the one figure on this page that is a queue of work
              rather than a fact about the platform. */}
          {stats.shops_pending_verification > 0 && (
            <Link
              to="/verification"
              className="block mb-5 rounded-panel border border-status-pending-text/20 bg-status-pending-bg p-4 hover:opacity-90"
            >
              <p className="text-sm font-semibold text-status-pending-text">
                {stats.shops_pending_verification} shop
                {stats.shops_pending_verification === 1 ? "" : "s"} waiting for verification
              </p>
              <p className="text-sm text-status-pending-text mt-0.5">
                Review them so those vendors can start taking orders.
              </p>
            </Link>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total customers" value={stats.total_customers} />
            <StatCard label="Total vendors" value={stats.total_vendors} />
            <StatCard label="Pending verification" value={stats.shops_pending_verification} />
            <StatCard label="Approved shops" value={stats.shops_approved} />
            <StatCard label="Rejected shops" value={stats.shops_rejected} />
            <StatCard label="Active orders right now" value={stats.active_orders_right_now} />
            <StatCard label="Orders today" value={stats.orders_today} />
            <StatCard label="Total orders" value={stats.total_orders} />
            <StatCard
              label="Platform revenue"
              value={formatRupees(stats.total_platform_revenue)}
              hint="Platform fee across all paid orders"
            />
          </div>
        </>
      ) : null}
    </AdminLayout>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="bg-surface border border-border rounded-panel p-4">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <p className="font-heading text-2xl font-bold text-text-primary mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}
