import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCheck, Headset, RefreshCw, Settings2, ShieldCheck, Store, Wallet } from "lucide-react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import { Badge, ErrorNote, Loading, formatDate, formatRupees } from "../components/ui";
import { verificationBreakdown } from "../lib/dashboard";

const initial = { data: null, error: "" };
const count = (value) => Number(value).toLocaleString("en-IN");

export default function Dashboard() {
  const [overview, setOverview] = useState(initial);
  const [orders, setOrders] = useState(initial);
  const [queue, setQueue] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const stats = overview.data;

  useEffect(() => {
    const controller = new AbortController();
    const config = { signal: controller.signal };
    setRefreshing(true);
    Promise.allSettled([
      api.get("/admin/stats/overview", config),
      api.get("/admin/orders?limit=5&skip=0", config),
      api.get("/admin/shops?verification_status=pending&limit=4&skip=0", config),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const apply = (setter, result, message) => setter((previous) => result.status === "fulfilled"
        ? { data: result.value.data, error: "" }
        : { ...previous, error: result.reason?.response?.data?.message || message });
      apply(setOverview, results[0], "Could not refresh the overview.");
      apply(setOrders, results[1], "Could not refresh recent orders.");
      apply(setQueue, results[2], "Could not refresh the verification queue.");
      if (results[0].status === "fulfilled") setUpdatedAt(new Date());
      setRefreshing(false);
    });
    return () => controller.abort();
  }, [revision]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
            <p className="mt-1.5 text-sm text-text-secondary">Orders, shops and the work that needs attention.</p>
          </div>
          <div className="flex items-center gap-4">
            {updatedAt && <span className="hidden text-xs text-text-muted sm:block">Updated {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
            <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={refreshing} className="flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-medium text-text-primary transition-colors hover:border-primary disabled:opacity-50">
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <ErrorNote>{overview.error}</ErrorNote>
        <section aria-label="Platform overview" aria-busy={refreshing} className="grid overflow-hidden rounded-panel border border-border bg-surface grid-cols-2 xl:grid-cols-4">
          <Metric label="Orders today" value={stats ? count(stats.orders_today) : "—"} note="Since midnight, IST" />
          <Metric label="Active orders" value={stats ? count(stats.active_orders_right_now) : "—"} note="Paid orders in progress" />
          <Metric label="Total customers" value={stats ? count(stats.total_customers) : "—"} note="Registered on Paprout" />
          <Metric label="Platform revenue" value={stats ? formatRupees(stats.total_platform_revenue) : "—"} note="All-time fees from paid orders" highlight />
        </section>

        <div className="grid items-stretch gap-6 xl:grid-cols-3">
          <section className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface xl:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold text-text-primary">Recent orders</h2>
                <p className="mt-1 text-xs text-text-secondary">{stats ? `${count(stats.total_orders)} orders across your network` : "Latest print orders"}</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-primary">View all <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            {orders.error && <div className="px-5 pt-4"><ErrorNote>{orders.error}</ErrorNote></div>}
            {!orders.data ? (refreshing ? <Loading label="Loading recent orders…" /> : null) : orders.data.length === 0 ? (
              <div className="flex min-h-60 items-center justify-center gap-5 px-6 py-10">
                <img src="/brand/paper-pal-pending.png" alt="" className="h-28 w-24 shrink-0 object-contain" />
                <div className="max-w-xs">
                  <h3 className="text-lg font-semibold text-text-primary">The print desk is clear</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">New orders will appear here when customers place their first print.</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-background/70 text-xs text-text-secondary"><tr>{["Order", "Shop", "Status", "Amount"].map((label) => <th key={label} className="px-5 py-3 font-medium">{label}</th>)}</tr></thead>
                  <tbody>{orders.data.map((order) => (
                    <tr key={order._id} className="border-b border-border last:border-0">
                      <td className="px-5 py-4"><span className="font-medium text-text-primary" title={order._id}>#{String(order._id).slice(-8).toUpperCase()}</span><span className="mt-1 block whitespace-nowrap text-xs text-text-muted">{formatDate(order.createdAt)}</span></td>
                      <td className="px-5 py-4 text-text-secondary">{order.shop_id?.shop_name || "Shop unavailable"}</td>
                      <td className="px-5 py-4"><Badge value={order.payment_status === "paid" ? order.status : order.payment_status} /></td>
                      <td className="px-5 py-4 font-medium tabular-nums text-text-primary">{formatRupees(order.total_amount)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col rounded-panel border border-busy-border bg-status-pending-bg p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium text-status-pending-text">{stats?.shops_pending_verification === 0 ? "All caught up" : "Needs attention"}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">Vendor verification</h2></div>
              <ShieldCheck size={23} strokeWidth={1.6} className="mt-1 shrink-0 text-status-pending-text" aria-hidden="true" />
            </div>
            <p className="mt-5 text-5xl font-semibold tracking-tight tabular-nums text-text-primary">{stats ? count(stats.shops_pending_verification) : "—"}<span className="ml-2 text-sm font-normal tracking-normal text-status-pending-text">awaiting review</span></p>
            {queue.error && <div className="mt-4"><ErrorNote>{queue.error}</ErrorNote></div>}
            {!queue.data ? (refreshing ? <Loading label="Loading queue…" /> : null) : queue.data.length ? (
              <ul className="my-4 divide-y divide-busy-border/70">{queue.data.map((shop) => <li key={shop._id} className="py-3"><span className="block text-sm font-medium text-text-primary">{shop.shop_name}</span><span className="mt-1 block text-xs text-status-pending-text">{shop.owner_id?.name || "Owner unavailable"}</span></li>)}</ul>
            ) : (
              <div className="my-5 flex items-center gap-2.5 text-sm text-status-pending-text"><CheckCheck size={18} aria-hidden="true" /><span>No shops waiting for review.</span></div>
            )}
            <Link to="/verification" className="mt-auto flex min-h-11 items-center justify-between gap-3 rounded-control border border-busy-border bg-surface/70 px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface">Open verification <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </section>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-3">
          <ShopOverview stats={stats} />
          <section className="rounded-panel border border-border bg-surface px-5 py-4">
            <h2 className="mb-2 font-semibold text-text-primary">Workspace</h2>
            <WorkspaceLink to="/support" icon={Headset} label="Support inbox" note="Help customers with their orders" />
            <WorkspaceLink to="/settlements" icon={Wallet} label="Shop settlements" note="Review pending shop balances" />
            <WorkspaceLink to="/settings" icon={Settings2} label="Platform settings" note="Fees and rush thresholds" />
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value, note, highlight }) {
  return <div className={`border-b border-border p-4 odd:border-r last:border-b-0 [&:nth-child(3)]:border-b-0 xl:border-b-0 xl:border-r xl:p-5 xl:last:border-r-0 ${highlight ? "bg-primary-wash" : ""}`}><p className="text-sm font-medium text-text-secondary">{label}</p><p className={`mt-3 text-3xl font-semibold sm:text-4xl tracking-tight tabular-nums ${highlight ? "text-primary-deep" : "text-text-primary"}`}>{value}</p><p className="mt-2 text-xs text-text-muted">{note}</p></div>;
}

function ShopOverview({ stats }) {
  const summary = stats ? verificationBreakdown(stats) : null;
  const groups = [
    { label: "Approved", key: "shops_approved", color: "bg-primary", dot: "bg-primary" },
    { label: "Awaiting review", key: "shops_pending_verification", color: "bg-yellow", dot: "bg-yellow" },
    { label: "Rejected", key: "shops_rejected", color: "bg-magenta", dot: "bg-magenta" },
  ];
  return (
    <section className="rounded-panel border border-border bg-surface p-5 xl:col-span-2">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-text-primary">Your shop network</h2><Link to="/shops" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">Manage shops <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <div className="mt-5 flex items-end gap-2"><span className="text-3xl font-semibold tracking-tight tabular-nums text-text-primary">{summary ? count(summary.total) : "—"}</span><span className="pb-1 text-sm text-text-secondary">registered shops</span></div>
      <div className="my-5 flex h-2 overflow-hidden rounded-full bg-background-soft" aria-hidden="true">{summary?.total > 0 && groups.map((group, i) => <div key={group.key} className={group.color} style={{ width: `${summary.percentages[i]}%` }} />)}</div>
      <dl className="grid grid-cols-3 gap-3">{groups.map((group) => <div key={group.key}><dt className="flex min-h-8 items-center gap-2 text-xs text-text-secondary sm:min-h-0"><span className={`h-2 w-2 shrink-0 rounded-full ${group.dot}`} />{group.label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-text-primary">{stats ? count(stats[group.key]) : "—"}</dd></div>)}</dl>
      <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-xs text-text-muted"><Store size={15} aria-hidden="true" />{stats ? `${count(stats.total_vendors)} registered vendors` : "Vendor totals unavailable"}</div>
    </section>
  );
}

function WorkspaceLink({ to, icon: Icon, label, note }) {
  return <Link to={to} className="group flex items-center gap-3 border-b border-border py-3 last:border-0"><Icon size={19} strokeWidth={1.7} className="shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-text-primary group-hover:text-primary">{label}</span><span className="mt-1 block text-xs text-text-muted">{note}</span></span><ArrowUpRight size={16} className="text-text-muted" aria-hidden="true" /></Link>;
}
