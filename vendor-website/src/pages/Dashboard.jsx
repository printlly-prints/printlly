import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import VerificationBanner from "../components/VerificationBanner";
import OrderDetailPanel from "../components/OrderDetailPanel";
import Panel, { PanelHeader, EmptyNote } from "../components/dashboard/Panel";
import KpiCard, { comparisonNote } from "../components/dashboard/KpiCard";
import Pipeline from "../components/dashboard/Pipeline";
import WeeklyChart from "../components/dashboard/WeeklyChart";
import NewOrderAlert from "../components/dashboard/NewOrderAlert";
import ShopStatusCard from "../components/dashboard/ShopStatusCard";
import {
  ACTIVE_COLUMNS,
  ACTIVE_GRID,
  ActiveOrderRow,
  Avatar,
  MiniOrderRow,
  clockTime,
  elapsed,
} from "../components/dashboard/OrderLines";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { orderRef } from "../utils/orderRef";
import {
  earningsBreakdown,
  orderPages,
  percentChange,
  shopPerformance,
  todayStats,
  weeklySeries,
} from "../utils/dashboardStats";

// The same cadence the Orders page polls at, for the same reason: a new
// order cannot push itself into the page, and an order that sits unseen
// in Pending is the failure this dashboard exists to prevent.
const POLL_MS = 20 * 1000;

// The API caps a page at 100 orders, so the window is built from at most
// two pages. Every figure on this page is derived from that window, and
// the performance panel says so rather than implying lifetime totals.
const PAGE = 100;
const MAX_PAGES = 2;

const ACTIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// The vendor's home screen. Answers, in reading order: what needs
// accepting, what is printing, what is waiting to be collected, and what
// today has earned.
export default function Dashboard() {
  const { shop, user } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [detail, setDetail] = useState(null); // { id, autoOtp }
  const [newOrder, setNewOrder] = useState(null);
  const [bellOpen, setBellOpen] = useState(false);

  // Ids seen on the previous fetch, so "new" means genuinely new rather
  // than "pending", which would re-alert on every poll.
  const seenIds = useRef(null);
  const actionRef = useRef(null);
  actionRef.current = actionLoading;

  const fetchOrders = useCallback(async () => {
    if (!shop) return;
    try {
      const collected = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data } = await api.get(
          `/orders/shop/${shop._id}?limit=${PAGE}&skip=${page * PAGE}`
        );
        collected.push(...data);
        if (data.length < PAGE) break;
      }

      // First load establishes the baseline - everything already there is
      // not "new", or opening the dashboard after lunch would announce
      // the whole morning.
      if (seenIds.current) {
        const fresh = collected.find(
          (o) => o.status === "pending" && !seenIds.current.has(o._id)
        );
        if (fresh) setNewOrder(fresh);
      }
      seenIds.current = new Set(collected.map((o) => o._id));

      setOrders(collected);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!shop) return undefined;
    const poll = () => {
      if (document.hidden || actionRef.current) return;
      fetchOrders();
    };
    const interval = setInterval(poll, POLL_MS);
    const onVisible = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shop, fetchOrders]);

  const updateOrder = async (orderId, request) => {
    setActionLoading(orderId);
    setError("");
    try {
      const { data } = await request();
      setOrders((prev) => prev.map((o) => (o._id === orderId ? data : o)));
      if (newOrder?._id === orderId) setNewOrder(null);
    } catch (err) {
      setError(err.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = (id) => updateOrder(id, () => api.patch(`/orders/${id}/accept`));
  const handleReady = (id) => updateOrder(id, () => api.patch(`/orders/${id}/ready`));
  const handleComplete = async (id, otp) => {
    await updateOrder(id, () => api.patch(`/orders/${id}/complete`, { otp }));
    setDetail(null);
  };

  const stats = useMemo(() => todayStats(orders), [orders]);
  const breakdown = useMemo(() => earningsBreakdown(orders), [orders]);
  const week = useMemo(() => weeklySeries(orders), [orders]);
  const performance = useMemo(() => shopPerformance(orders), [orders]);

  const active = useMemo(
    () =>
      orders
        .filter((o) => ACTIVE_STATUSES.includes(o.status))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [orders]
  );
  const printing = useMemo(() => orders.filter((o) => o.status === "accepted"), [orders]);
  const ready = useMemo(() => orders.filter((o) => o.status === "ready_for_pickup"), [orders]);
  const recent = useMemo(
    () =>
      orders
        .filter((o) => o.status === "completed")
        .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        .slice(0, 5),
    [orders]
  );
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);

  const detailOrder = detail ? orders.find((o) => o._id === detail.id) : null;
  const firstName = (shop?.shop_name || user?.name || "").split(" ")[0];
  const hasAnyOrders = orders.length > 0;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto flex flex-col gap-4 motion-safe:animate-[printlly-rise_300ms_ease-out]">
        <VerificationBanner shop={shop} />

        {/* --- header ------------------------------------------------- */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text-primary">
              {greeting()}, {firstName || "there"}
            </h1>
            <p className="text-sm text-text-secondary">
              Here's what's happening with your shop today.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* The bell is derived from real orders - there is no
                notification store in this backend, so it lists what is
                actually waiting rather than inventing a feed. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((v) => !v)}
                aria-expanded={bellOpen}
                aria-label={`Notifications: ${pendingOrders.length} order${
                  pendingOrders.length === 1 ? "" : "s"
                } waiting to be accepted`}
                className="relative w-10 h-10 rounded-control bg-surface border border-border text-text-secondary hover:text-primary-bright hover:border-primary/30 transition-colors duration-200 grid place-items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {pendingOrders.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold grid place-items-center tabular-nums">
                    {pendingOrders.length}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 top-12 z-30 w-72 bg-surface border border-border rounded-card shadow-dropdown p-2">
                  <p className="px-2 py-1.5 text-xs font-semibold text-text-muted">
                    Waiting to be accepted
                  </p>
                  {pendingOrders.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-text-secondary">Nothing waiting. All caught up.</p>
                  ) : (
                    pendingOrders.slice(0, 5).map((order) => (
                      <button
                        key={order._id}
                        type="button"
                        onClick={() => {
                          setBellOpen(false);
                          setDetail({ id: order._id });
                        }}
                        className="w-full text-left px-2 py-2 rounded-control hover:bg-primary-wash transition-colors duration-200"
                      >
                        <span className="block text-sm font-medium text-text-primary truncate">
                          {order.customer_id?.name || "Unknown customer"}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {orderRef(order)} · ₹{order.total_amount ?? 0} · {elapsed(order.createdAt)} ago
                        </span>
                      </button>
                    ))
                  )}
                  <Link to="/notifications" className="mt-2 block border-t border-border px-2 py-3 text-sm font-medium text-primary">Shop & account notifications →</Link>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              className="h-10 px-4 rounded-control bg-surface border border-border text-sm font-semibold text-text-secondary hover:text-primary-bright hover:border-primary/30 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Refresh
            </button>
          </div>
        </header>

        {newOrder && (
          <NewOrderAlert
            order={newOrder}
            busy={actionLoading === newOrder._id}
            onAccept={handleAccept}
            onView={(o) => {
              setNewOrder(null);
              setDetail({ id: o._id });
            }}
            onDismiss={() => setNewOrder(null)}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-error-text bg-error-bg rounded-control p-3">
            {error}
          </p>
        )}

        {/* --- KPIs ---------------------------------------------------- */}
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={<IconReceipt />}
            label="Today's orders"
            value={loading ? "—" : stats.orderCount}
            note={comparisonNote(percentChange(stats.orderCount, stats.yesterdayOrderCount), "yesterday")}
            to="/orders"
          />
          <KpiCard
            tone="amber"
            icon={<IconBell />}
            label="Pending orders"
            value={loading ? "—" : stats.pending}
            note={stats.pending ? "Needs accepting now" : "All caught up"}
            to="/orders?status=pending"
          />
          <KpiCard
            tone="success"
            icon={<IconBag />}
            label="Ready for pickup"
            value={loading ? "—" : stats.readyForPickup}
            note={stats.readyForPickup ? "Waiting on the counter" : "Nothing waiting"}
            to="/orders?status=ready_for_pickup"
          />
          <KpiCard
            tone="green"
            icon={<IconRupee />}
            label="Today's earnings"
            value={loading ? "—" : `₹${stats.earnings}`}
            note={comparisonNote(percentChange(stats.earnings, stats.yesterdayEarnings), "yesterday")}
          />
        </div>

        {/* --- pipeline ------------------------------------------------ */}
        <Panel className="p-4">
          <PanelHeader
            title="Today's pipeline"
            subtitle="Tap a stage to open it in Orders"
            className="mb-3"
          />
          <Pipeline orders={orders} />
        </Panel>

        {/* --- main column + rail -------------------------------------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4 min-w-0">
            {/* Active orders - the most important section on the page. */}
            <Panel className="p-4">
              <PanelHeader
                title="Active orders"
                subtitle="Oldest first — the one that has waited longest is at the top"
                className="mb-3"
                action={
                  <Link
                    to="/orders"
                    className="text-sm font-semibold text-primary-bright hover:text-primary-deep whitespace-nowrap"
                  >
                    View all →
                  </Link>
                }
              />

              {loading ? (
                <RowSkeletons />
              ) : active.length === 0 ? (
                <EmptyNote
                  icon={<IconReceipt />}
                  image={!hasAnyOrders ? "/art/vendor/print-desk-v1.webp" : undefined}
                  title={hasAnyOrders ? "No active orders" : "No orders yet"}
                  hint={
                    hasAnyOrders
                      ? "Everything placed so far has been collected."
                      : "Your new orders will appear here as customers place them."
                  }
                  action={
                    !hasAnyOrders && (
                      <Link
                        to="/shop-profile"
                        className="shrink-0 px-3 h-9 grid place-items-center rounded-control bg-primary text-white text-xs font-bold hover:bg-primary-deep transition-colors duration-200"
                      >
                        View shop profile
                      </Link>
                    )
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[860px]">
                    <div
                      className={`${ACTIVE_GRID} px-3 pb-2 text-[11px] font-semibold text-text-muted`}
                    >
                      {ACTIVE_COLUMNS.map((column) => (
                        <span key={column} className={column === "Action" ? "text-right" : ""}>
                          {column}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      {active.slice(0, 8).map((order, i) => (
                        <ActiveOrderRow
                          key={order._id}
                          order={order}
                          zebra={i % 2 === 1}
                          onView={(o) =>
                            setDetail({ id: o._id, autoOtp: o.status === "ready_for_pickup" })
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {active.length > 8 && (
                <p className="mt-2 text-xs text-text-muted">
                  Showing the 8 oldest of {active.length} active orders.{" "}
                  <Link to="/orders" className="text-primary-bright hover:underline">
                    See all
                  </Link>
                </p>
              )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Printing now. "Accepted" IS the printing state in this
                  backend - there is no separate printing status - so this
                  shows accepted orders and says what it is showing. No
                  progress bar: nothing reports printer progress, and a
                  percentage nobody measures would be a decoration
                  pretending to be data. Elapsed time is real. */}
              <Panel className="p-4">
                <PanelHeader
                  title="Printing now"
                  subtitle="Orders you've accepted"
                  className="mb-3"
                />
                {printing.length === 0 ? (
                  <EmptyNote icon={<IconPrinter />} title="Nothing on the printer" hint="Accepted orders show up here." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {printing.slice(0, 4).map((order) => (
                      <MiniOrderRow
                        key={order._id}
                        tone="printing"
                        primary={order.documents?.[0]?.original_name || `${order.documents?.length ?? 0} documents`}
                        secondary={`${order.customer_id?.name || "Customer"} · ${orderPages(order)} pages · ${orderRef(order)}`}
                        meta={
                          <span className="text-[11px] text-text-secondary tabular-nums">
                            {elapsed(order.updatedAt || order.createdAt)}
                          </span>
                        }
                        action={
                          <button
                            type="button"
                            onClick={() => handleReady(order._id)}
                            disabled={actionLoading === order._id}
                            className="shrink-0 px-3 h-8 rounded-control bg-success text-white text-xs font-bold hover:brightness-95 disabled:opacity-50 transition-[filter,opacity] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                          >
                            {actionLoading === order._id ? "…" : "Mark ready"}
                          </button>
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>

              {/* Ready for pickup. The OTP is deliberately NOT printed
                  here - it is the customer's proof of identity at the
                  counter, and a dashboard left open on a shop desk should
                  not display it. Opening the order asks for it instead. */}
              <Panel className="p-4">
                <PanelHeader
                  title="Ready for pickup"
                  subtitle="Waiting for the customer"
                  className="mb-3"
                />
                {ready.length === 0 ? (
                  <EmptyNote icon={<IconBag />} title="Nothing waiting" hint="Orders you mark ready appear here." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {ready.slice(0, 4).map((order) => (
                      <MiniOrderRow
                        key={order._id}
                        tone="ready"
                        primary={order.customer_id?.name || "Customer"}
                        secondary={`${orderRef(order)} · ${order.documents?.length ?? 0} files · ₹${order.total_amount ?? 0}`}
                        meta={
                          <span className="text-[11px] text-text-secondary tabular-nums">
                            {elapsed(order.updatedAt || order.createdAt)}
                          </span>
                        }
                        action={
                          <button
                            type="button"
                            onClick={() => setDetail({ id: order._id, autoOtp: true })}
                            className="shrink-0 px-3 h-8 rounded-control bg-primary text-white text-xs font-bold hover:bg-primary-deep transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          >
                            Verify OTP
                          </button>
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            {/* --- charts ---------------------------------------------- */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <PanelHeader title="Orders this week" subtitle="Last 7 days" className="mb-3" />
                <WeeklyChart days={week} metric="orders" />
              </Panel>

              <Panel className="p-4">
                <PanelHeader
                  title="Today's earnings"
                  subtitle="Your share, after the platform fee"
                  className="mb-3"
                />
                <p className="font-heading text-3xl font-semibold text-text-primary tabular-nums">
                  ₹{stats.earnings}
                </p>
                {breakdown.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">No earnings recorded today yet.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {breakdown.rows.map((row) => (
                      <li key={row.label} className="flex justify-between text-sm">
                        <span className="text-text-secondary">{row.label}</span>
                        <span className="tabular-nums text-text-primary">₹{row.value}</span>
                      </li>
                    ))}
                    {/* Stated, not hidden: it is why this total differs
                        from what customers paid. */}
                    <li className="flex justify-between text-xs pt-1.5 mt-1 border-t border-border">
                      <span className="text-text-muted">Platform fee (not yours)</span>
                      <span className="tabular-nums text-text-muted">−₹{breakdown.platformFee}</span>
                    </li>
                  </ul>
                )}
              </Panel>
            </div>

            {/* --- recent ---------------------------------------------- */}
            <Panel className="p-4">
              <PanelHeader
                title="Recent orders"
                subtitle="Collected and closed"
                className="mb-3"
                action={
                  <Link
                    to="/orders?status=completed"
                    className="text-sm font-semibold text-primary-bright hover:text-primary-deep whitespace-nowrap"
                  >
                    View all orders →
                  </Link>
                }
              />
              {recent.length === 0 ? (
                <EmptyNote icon={<IconCheck />} title="No completed orders yet" hint="Collected orders are listed here." />
              ) : (
                <div className="flex flex-col gap-2">
                  {recent.map((order) => (
                    <MiniOrderRow
                      key={order._id}
                      primary={
                        <span className="flex items-center gap-2">
                          <Avatar name={order.customer_id?.name} />
                          {order.customer_id?.name || "Customer"}
                        </span>
                      }
                      secondary={`${orderRef(order)} · ${new Date(
                        order.updatedAt || order.createdAt
                      ).toLocaleDateString([], { day: "2-digit", month: "short" })} · ${clockTime(
                        order.updatedAt || order.createdAt
                      )}`}
                      meta={
                        <span className="text-sm font-bold text-text-primary tabular-nums">
                          ₹{order.total_amount ?? 0}
                        </span>
                      }
                      action={
                        <button
                          type="button"
                          onClick={() => setDetail({ id: order._id })}
                          className="shrink-0 px-3 h-8 rounded-control text-xs font-semibold text-primary-bright hover:bg-primary-wash transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          View
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {/* --- right rail ------------------------------------------- */}
          <div className="flex flex-col gap-4 min-w-0">
            <ShopStatusCard />

            <Panel className="p-4">
              <PanelHeader title="Quick actions" className="mb-3" />
              <div className="grid grid-cols-2 gap-2">
                <QuickAction to="/pricing" icon={<IconTag />} label="Edit pricing" />
                <QuickAction to="/shop-profile" icon={<IconUser />} label="Shop profile" />
                <QuickAction to="/pricing#services" icon={<IconLayers />} label="Manage services" />
                <QuickAction to="/orders" icon={<IconReceipt />} label="View orders" />
              </div>
            </Panel>

            <Panel className="p-4">
              <PanelHeader
                title="Shop performance"
                // Said plainly rather than implied: the API returns at
                // most 200 orders here, so these are recent figures, not
                // lifetime ones.
                subtitle={`From your last ${performance.sampleSize} order${
                  performance.sampleSize === 1 ? "" : "s"
                }`}
                className="mb-3"
              />
              <dl className="flex flex-col gap-2.5">
                <Stat label="Orders completed" value={performance.completed} />
                <Stat
                  label="Completion rate"
                  value={performance.completionRate === null ? "—" : `${performance.completionRate}%`}
                  hint={performance.completionRate === null ? "No finished orders yet" : null}
                />
                <Stat
                  label="Avg. preparation time"
                  value={performance.avgPrepMinutes === null ? "—" : `${performance.avgPrepMinutes} min`}
                  hint={
                    performance.avgPrepMinutes === null
                      ? "Measured once orders are marked ready"
                      : `From ${performance.prepSampleSize} order${performance.prepSampleSize === 1 ? "" : "s"}`
                  }
                />
              </dl>
              {/* Customer rating is not shown because this backend has no
                  rating or review field on a shop or an order - there is
                  nothing to read, and a number here would be invented. */}
            </Panel>
          </div>
        </div>
      </div>

      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          autoOtp={detail.autoOtp}
          onClose={() => setDetail(null)}
          onAccept={handleAccept}
          onReady={handleReady}
          onComplete={handleComplete}
          actionLoading={actionLoading}
        />
      )}
    </DashboardLayout>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-text-secondary">
        {label}
        {hint && <span className="block text-[11px] text-text-muted">{hint}</span>}
      </dt>
      <dd className="font-heading font-bold text-text-primary tabular-nums">{value}</dd>
    </div>
  );
}

function QuickAction({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1.5 p-3 rounded-card border border-border bg-background-soft/50 hover:bg-primary-wash hover:border-primary/30 transition-[background-color,border-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="text-primary-bright" aria-hidden="true">
        {icon}
      </span>
      <span className="text-xs font-semibold text-text-primary leading-tight">{label}</span>
    </Link>
  );
}

function RowSkeletons() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-14 rounded-card border border-border bg-background-soft/60 animate-pulse" />
      ))}
    </div>
  );
}

/* --- icons: same 18px stroke language as the sidebar ----------------- */
function Icon({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function IconReceipt() {
  return (
    <Icon>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </Icon>
  );
}
function IconBell() {
  return (
    <Icon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Icon>
  );
}
function IconBag() {
  return (
    <Icon>
      <path d="M6 7h12l-1 13H7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </Icon>
  );
}
function IconRupee() {
  return (
    <Icon>
      <path d="M7 5h10M7 9h10M15 5c0 4-3.5 4-8 4l8 10" />
    </Icon>
  );
}
function IconPrinter() {
  return (
    <Icon>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 15h10v6H7z" />
    </Icon>
  );
}
function IconCheck() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <polyline points="8.5 12.5 11 15 15.5 9.5" />
    </Icon>
  );
}
function IconTag() {
  return (
    <Icon>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </Icon>
  );
}
function IconUser() {
  return (
    <Icon>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  );
}
function IconLayers() {
  return (
    <Icon>
      <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
      <polyline points="2 15.5 12 22 22 15.5" />
    </Icon>
  );
}
