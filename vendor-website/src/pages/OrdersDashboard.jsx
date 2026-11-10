import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useOrderEvents from "../hooks/useOrderEvents";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import OrderRow, { ORDER_GRID, orderTags } from "../components/OrderRow";
import OrderDetailPanel from "../components/OrderDetailPanel";
import VerificationBanner from "../components/VerificationBanner";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { orderRef } from "../utils/orderRef";

// Every order this shop has, in one place - this page absorbed the old
// "Recent Orders" screen, which was this same table opened on Completed.
//
// "All" is first so there is a view that hides nothing; the rest map
// directly to the backend's own status values. There is no separate
// "Printing" tab because there is no printing status: an order goes
// pending -> accepted -> ready_for_pickup, and accepted IS the state
// where the shop has taken the job and is printing it. A Printing tab
// would either be permanently empty or a duplicate of Accepted under
// another name, and the badge on every row would then disagree with the
// tab that found it.
//
// "Expired" (set by the abandoned-order cleanup cron) keeps its own tab
// rather than being mixed into Pending or Completed - it's not something
// to act on, but the order still exists and should stay reachable.
const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "ready_for_pickup", label: "Ready for pickup" },
  { key: "completed", label: "Completed" },
  { key: "expired", label: "Expired" },
];

// "All" is a view, not a status - nothing on an order ever equals it.
const matchesTab = (order, tab) => tab === "all" || order.status === tab;

// How often the order list refetches itself while this tab is visible.
// Short enough that a vendor notices a new order without being told to
// refresh, long enough not to hammer the API from an idle dashboard.
const ORDER_POLL_MS = 20 * 1000;

// Rows are compact, so a screenful is a page. Past this the list starts
// scrolling the page itself, which is the thing a table layout exists to
// avoid.
const PAGE_SIZE = 15;

const DATE_FILTERS = [
  { key: "all", label: "Any date", days: null },
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
];

const COLUMNS = [
  "Customer",
  "Order ID",
  "Placed on",
  "Documents",
  "Pages",
  "Amount",
  "Status",
  "Action",
];

// Matches the search box against the things a vendor actually has in
// front of them when looking an order up: the customer on the phone, the
// reference they were read, or the number that called.
function matchesQuery(order, query) {
  if (!query) return true;
  const haystack = [
    order.customer_id?.name,
    order.customer_id?.phone,
    order.customer_id?.email,
    orderRef(order),
    String(order._id),
    // The tags shown in the row, so "spiral" finds the spiral-bound jobs.
    ...orderTags(order).map((t) => t.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function withinDateFilter(order, days) {
  if (days === null) return true;
  const placed = new Date(order.createdAt);
  if (days === 0) {
    const now = new Date();
    return (
      placed.getDate() === now.getDate() &&
      placed.getMonth() === now.getMonth() &&
      placed.getFullYear() === now.getFullYear()
    );
  }
  return placed.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

// The one order-management screen: the live queue, order history, search,
// date filtering and sorting. Fetches every order for this shop once,
// then filters client-side per tab so switching tabs is instant and the
// counts stay visible without extra requests.
//
// ?status= drives the opening tab, which is how the dashboard's pipeline,
// its KPI cards and the old /recent-orders bookmark all land on the right
// view without a second copy of this table existing anywhere.
export default function OrdersDashboard() {
  const { shop } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("status");

  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState(
    TABS.some((t) => t.key === requestedStatus) ? requestedStatus : "pending"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null); // id of order being updated

  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(1);
  // { id, autoOtp, viewIndex } - stored by id, not by object, so the poll
  // replacing the orders array keeps the open panel in sync with it.
  const [detail, setDetail] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!shop) return;
    try {
      const { data } = await api.get(`/orders/shop/${shop._id}`);
      setOrders(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Realtime: refresh when one of this shop's orders changes, instead of
  // waiting for the next poll below. The event is only a trigger - the list
  // still comes from fetchOrders, so there is one source of truth and a
  // missed event costs nothing but the old polling latency.
  useOrderEvents(fetchOrders);

  // Navigating from the dashboard to a different status while already on
  // this page changes the query string without remounting.
  useEffect(() => {
    if (requestedStatus && TABS.some((t) => t.key === requestedStatus)) {
      setActiveTab(requestedStatus);
    }
  }, [requestedStatus]);

  // A new order placed by a customer can't push itself into this page, so
  // without polling a vendor only ever sees it by hitting Refresh - which
  // meant orders could sit unnoticed in Pending for as long as nobody
  // thought to click. Poll quietly instead; the Refresh button stays for
  // when someone wants an answer right now.
  //
  // Paused while the tab is hidden (a dashboard left open in a background
  // tab overnight shouldn't keep hitting the API) and resumed with an
  // immediate fetch when it comes back, so returning to the tab shows
  // current orders rather than a poll-interval-old snapshot.
  const actionLoadingRef = useRef(null);
  actionLoadingRef.current = actionLoading;

  useEffect(() => {
    if (!shop) return undefined;

    const poll = () => {
      // Skip this tick if the vendor is mid-action: fetchOrders replaces
      // the whole list, and updateOrder is about to write the authoritative
      // updated order into it anyway.
      if (document.hidden || actionLoadingRef.current) return;
      fetchOrders();
    };

    const interval = setInterval(poll, ORDER_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shop, fetchOrders, actionLoading]);

  // Shared handler for the three status-changing endpoints. Each one
  // returns the updated order, which we swap into local state so the
  // row moves to its new tab without a full refetch.
  const updateOrder = async (orderId, request) => {
    setActionLoading(orderId);
    setError("");
    try {
      const { data } = await request();
      setOrders((prev) => prev.map((o) => (o._id === orderId ? data : o)));
    } catch (err) {
      setError(err.response?.data?.message || "Action failed. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = (orderId) =>
    updateOrder(orderId, () => api.patch(`/orders/${orderId}/accept`));

  const handleReady = (orderId) =>
    updateOrder(orderId, () => api.patch(`/orders/${orderId}/ready`));

  const handleComplete = async (orderId, otp) => {
    await updateOrder(orderId, () => api.patch(`/orders/${orderId}/complete`, { otp }));
    setDetail(null);
  };

  const countFor = (tab) => orders.filter((o) => matchesTab(o, tab)).length;

  // Switching tabs rewrites ?status= so the view is linkable and the
  // browser's Back button steps between tabs the way it looks like it
  // should. replace: true keeps one page of tab-flipping from burying
  // wherever the vendor came from.
  const selectTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === "pending" ? {} : { status: key }, { replace: true });
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const days = DATE_FILTERS.find((d) => d.key === dateFilter)?.days ?? null;
    const rows = orders.filter(
      (o) => matchesTab(o, activeTab) && withinDateFilter(o, days) && matchesQuery(o, needle)
    );
    return rows.sort((a, b) =>
      sort === "latest"
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt)
    );
  }, [orders, activeTab, query, dateFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // A filter change can leave you on a page that no longer exists; clamp
  // rather than render an empty page with rows sitting on page 1.
  const currentPage = Math.min(page, pageCount);
  const visibleOrders = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, dateFilter, sort]);

  // Re-read from the live list so the panel shows the current status
  // after an action or a poll, not the snapshot taken when it opened.
  const detailOrder = detail ? orders.find((o) => o._id === detail.id) : null;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Access to everything below is never gated on this - see
            VerificationBanner's own comment. */}
        <VerificationBanner shop={shop} />

        <div className="flex items-center justify-between">
          <h1 className="font-heading text-2xl font-bold text-text-primary">Orders</h1>
          <button
            onClick={fetchOrders}
            className="text-sm font-medium text-primary-bright hover:text-primary-deep rounded-control px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Refresh
          </button>
        </div>

        {/* Status tabs with live counts so staff can see the queue at a glance */}
        <div className="mt-4 flex flex-wrap gap-2 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              aria-current={activeTab === tab.key ? "page" : undefined}
              className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                activeTab === tab.key
                  ? "border-primary text-primary-bright"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label} ({countFor(tab.key)})
            </button>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-error-text bg-error-bg rounded-control p-3"
          >
            {error}
          </p>
        )}

        {/* One panel holds the toolbar, the rows and the pager, so the
            queue reads as a single surface rather than a pile of cards. */}
        <div className="mt-5 bg-surface border border-border rounded-panel shadow-card">
          <div className="px-4 py-3.5 border-b border-border flex flex-wrap items-center gap-2.5">
            <label className="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[220px]">
              <span className="sr-only">Search orders</span>
              <span
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm"
              >
                ⌕
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, order ID or phone"
                className="w-full h-10 pl-8 pr-3 text-sm bg-background-soft border border-border rounded-control text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Filter by date</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background-soft border border-border rounded-control text-text-secondary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {DATE_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 flex-1 sm:flex-none">
              <span className="sr-only">Sort orders</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-background-soft border border-border rounded-control text-text-secondary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="latest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>

          {/* The columns are fixed-width by design, so narrow screens
              scroll the table sideways rather than crushing the amount
              and status columns into two characters each. */}
          {!loading && visibleOrders.length === 0 ? (
            <EmptyQueue
              label={activeTab === "all" ? null : TABS.find((t) => t.key === activeTab)?.label}
              filtered={filtered.length === 0 && (query || dateFilter !== "all")}
              onClear={() => {
                setQuery("");
                setDateFilter("all");
              }}
            />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1100px] px-3 py-3">
                <div
                  role="row"
                  className={`${ORDER_GRID} px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted`}
                >
                  {COLUMNS.map((column) => (
                    <span key={column} className={column === "Action" ? "text-right" : ""}>
                      {column}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  {loading
                    ? Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)
                    : visibleOrders.map((order, i) => (
                        <OrderRow
                          key={order._id}
                          order={order}
                          zebra={i % 2 === 1}
                          busy={actionLoading === order._id}
                          onView={(o, opts) => setDetail({ id: o._id, autoOtp: !!opts?.completing })}
                          onViewPrint={(o) => setDetail({ id: o._id, viewIndex: 0 })}
                          onAccept={handleAccept}
                          onReady={handleReady}
                        />
                      ))}
                </div>
              </div>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
              <p className="text-xs text-text-secondary">
                Showing{" "}
                <span className="font-semibold text-text-primary">
                  {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <PagerButton
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  label="Previous"
                >
                  ‹
                </PagerButton>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    aria-current={n === currentPage ? "page" : undefined}
                    className={`min-w-8 h-8 px-2 rounded-control text-xs font-semibold transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      n === currentPage
                        ? "bg-primary text-white"
                        : "text-text-secondary hover:bg-primary-wash hover:text-primary-bright"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <PagerButton
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  label="Next"
                >
                  ›
                </PagerButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          autoOtp={detail.autoOtp}
          initialViewingIndex={detail.viewIndex ?? null}
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

function PagerButton({ disabled, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-8 h-8 rounded-control text-text-secondary hover:bg-primary-wash hover:text-primary-bright disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {children}
    </button>
  );
}

// Skeleton rather than a spinner, so the table keeps its shape while the
// first fetch lands and the rows don't make the page jump when they
// arrive.
function RowSkeleton() {
  return (
    <div className={`${ORDER_GRID} px-4 py-3 rounded-card border border-border bg-surface`}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-background-soft animate-pulse" />
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-24 rounded bg-background-soft animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-background-soft animate-pulse" />
        </div>
      </div>
      <div className="h-3 w-14 rounded bg-background-soft animate-pulse" />
      <div className="h-3 w-20 rounded bg-background-soft animate-pulse" />
      <div className="h-5 w-32 rounded-full bg-background-soft animate-pulse" />
      <div className="h-3 w-8 rounded bg-background-soft animate-pulse" />
      <div className="h-3 w-12 rounded bg-background-soft animate-pulse" />
      <div className="h-6 w-20 rounded-full bg-background-soft animate-pulse" />
      <div className="h-8 w-28 justify-self-end rounded-control bg-background-soft animate-pulse" />
    </div>
  );
}

function EmptyQueue({ label, filtered, onClear }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-primary-wash flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#087F8C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9.5 8h5M9.5 12h5" />
        </svg>
      </div>
      <p className="font-heading font-bold text-text-primary">
        {filtered ? "No orders match your filters" : "Nothing here right now"}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-semibold text-primary-bright hover:text-primary-deep rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Clear search and filters
        </button>
      ) : (
        <p className="text-sm text-text-secondary">
          {label
            ? `No orders are ${label.toLowerCase()}.`
            : "You haven't taken any orders yet."}{" "}
          New ones appear here as customers place them.
        </p>
      )}
    </div>
  );
}
