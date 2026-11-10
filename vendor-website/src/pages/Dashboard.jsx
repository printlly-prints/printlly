import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, FileText } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import VerificationBanner from "../components/VerificationBanner";
import OrderDetailPanel from "../components/OrderDetailPanel";
import Panel, { EmptyNote } from "../components/dashboard/Panel";
import NewOrderAlert from "../components/dashboard/NewOrderAlert";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import useOrderEvents from "../hooks/useOrderEvents";
import { orderRef } from "../utils/orderRef";
import { todayStats } from "../utils/dashboardStats";
import { formatRupees } from "../utils/payout";

const POLL_MS = 20_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 2;
const QUEUE_LIMIT = 6;
const STAGES = [
  { status: "pending", label: "New orders", hint: "Review the print details before accepting.", empty: "No new orders", action: "Review order" },
  { status: "accepted", label: "Printing", hint: "Mark the order ready once the prints are done.", empty: "Nothing printing", action: "Mark ready" },
  { status: "ready_for_pickup", label: "For pickup", hint: "Ask the customer for their pickup code.", empty: "No pickups waiting", action: "Enter pickup code" },
];

const focus = "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const actionStyle = `min-h-11 rounded-control px-3 text-sm font-semibold ${focus}`;
const primary = `${actionStyle} bg-primary text-white hover:bg-primary-deep disabled:opacity-50`;
const secondary = `${actionStyle} text-primary-deep hover:bg-primary-wash disabled:opacity-50`;

export default function Dashboard() {
  const { shop } = useAuth();
  const shopId = shop?._id;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [selection, setSelection] = useState(null);
  const [detail, setDetail] = useState(null);
  const [arrivalId, setArrivalId] = useState(null);
  const seenIds = useRef(null);
  const version = useRef(0);
  const busy = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (!shopId || busy.current) return;
    const request = ++version.current;
    try {
      const collected = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data } = await api.get(`/orders/shop/${shopId}?limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`);
        if (request !== version.current) return;
        collected.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
      if (seenIds.current) {
        const fresh = collected.find((order) => order.status === "pending" && !seenIds.current.has(order._id));
        if (fresh) setArrivalId(fresh._id);
      }
      seenIds.current = new Set(collected.map((order) => order._id));
      setOrders(collected);
      setLoadError("");
    } catch {
      if (request === version.current) setLoadError("Could not load your orders.");
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [shopId]);

  useOrderEvents(fetchOrders);
  useEffect(() => {
    seenIds.current = null;
    fetchOrders();
    const refresh = () => {
      if (!document.hidden) fetchOrders();
    };
    const interval = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      version.current += 1;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchOrders]);

  const updateOrder = async (id, step, body) => {
    if (busy.current) return false;
    busy.current = true;
    // An earlier poll must not replace the updated status with an older one.
    version.current += 1;
    setBusyId(id);
    setActionError("");
    try {
      const { data } = await api.patch(`/orders/${id}/${step}`, body);
      setOrders((previous) => previous.map((order) => order._id === id ? data : order));
      setArrivalId((previous) => previous === id ? null : previous);
      return true;
    } catch (error) {
      setActionError(error.response?.data?.message || "Could not update this order. Please try again.");
      return false;
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  };

  const closeDetail = useCallback(() => {
    setDetail(null);
    setActionError("");
  }, []);
  const openDetail = (order, autoOtp = false) => {
    setActionError("");
    setDetail({ id: order._id, autoOtp });
  };

  const queues = useMemo(() => {
    const sorted = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return Object.fromEntries(STAGES.map(({ status }) => [
      status, sorted.filter((order) => order.status === status),
    ]));
  }, [orders]);
  const stage = selection ?? STAGES.find(({ status }) => queues[status].length) ?? STAGES[0];
  const queue = queues[stage.status];
  const waiting = STAGES.some(({ status }) => queues[status].length > 0);
  const arrival = queues.pending.find((order) => order._id === arrivalId);
  const detailOrder = orders.find((order) => order._id === detail?.id);
  const stats = todayStats(orders);
  const hasLoaded = seenIds.current !== null;

  return (
    <DashboardLayout>
      <main className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">Shop dashboard</h1>
            <p className="mt-1 text-sm text-text-secondary">Accept orders, prepare prints and confirm pickups.</p>
          </div>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-control border border-border bg-surface text-primary-deep hover:bg-primary-wash ${focus}`}
          >
            <Bell size={19} aria-hidden="true" />
          </Link>
        </header>

        <VerificationBanner shop={shop} />

        <Panel aria-labelledby="work-queue-title" className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="work-queue-title" className="font-heading text-lg font-bold">Orders to work on</h2>
            <Link to="/orders?status=all" className={`inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-semibold text-primary-deep hover:underline ${focus}`}>
              All orders <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>

          {arrival && (
            <NewOrderAlert
              order={arrival}
              onView={() => {
                setArrivalId(null);
                setSelection(STAGES[0]);
                openDetail(arrival);
              }}
              onDismiss={() => setArrivalId(null)}
            />
          )}

          <div role="group" aria-label="Filter orders" className="mt-3 grid grid-cols-3 gap-1 rounded-card bg-background-soft p-1">
            {STAGES.map((item) => (
              <button
                key={item.status}
                type="button"
                aria-pressed={stage.status === item.status}
                aria-controls="work-queue"
                onClick={() => {
                  setSelection(item);
                  setActionError("");
                }}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border px-1 py-2 text-center text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm ${focus} ${
                  stage.status === item.status
                    ? "border-primary/30 bg-surface text-primary-deep"
                    : "border-transparent text-text-secondary hover:bg-surface"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-lg tabular-nums sm:text-base">{hasLoaded ? queues[item.status].length : "—"}</span>
              </button>
            ))}
          </div>

          <div id="work-queue" className="mt-4" aria-busy={loading}>
            {loadError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-error-bg px-3 py-2">
                <p role="alert" className="text-sm text-error-text">{loadError}</p>
                <button type="button" onClick={fetchOrders} className={secondary}>Retry</button>
              </div>
            )}
            {actionError && !detailOrder && (
              <p role="alert" className="mb-3 rounded-control bg-error-bg px-3 py-2 text-sm text-error-text">{actionError}</p>
            )}
            {loading ? (
              <p role="status" className="py-8 text-center text-sm text-text-secondary">Loading your orders…</p>
            ) : queue.length ? (
              <>
                <p className="mb-2 text-sm text-text-secondary">{stage.hint}</p>
                <ul className="divide-y divide-border border-t border-border">
                  {queue.slice(0, QUEUE_LIMIT).map((order) => (
                    <QueueRow
                      key={order._id}
                      order={order}
                      stage={stage}
                      busyId={busyId}
                      onDetails={() => openDetail(order)}
                      onAction={() => stage.status === "accepted"
                        ? updateOrder(order._id, "ready")
                        : openDetail(order, stage.status === "ready_for_pickup")}
                    />
                  ))}
                </ul>
                {queue.length > QUEUE_LIMIT && (
                  <Link to={`/orders?status=${stage.status}`} className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-primary-deep hover:underline ${focus}`}>
                    See all {queue.length} orders in this list
                  </Link>
                )}
              </>
            ) : !loadError && (
              <EmptyNote
                image={!waiting ? "/art/vendor/print-desk-v1.webp" : undefined}
                title={waiting ? stage.empty : "No orders waiting"}
                hint={waiting ? stage.hint : "New orders will appear here when customers pay."}
              />
            )}
          </div>
        </Panel>

        <Panel aria-labelledby="today-title" className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <h2 id="today-title" className="font-heading text-lg font-bold">Today</h2>
            <Link to="/earnings" className={`inline-flex min-h-11 items-center gap-1 rounded-control text-sm font-semibold text-primary-deep hover:underline ${focus}`}>
              Earnings details <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <dl className="mt-1 grid grid-cols-2 divide-x divide-border">
            <div className="pr-4">
              <dt className="text-sm text-text-secondary">Orders placed</dt>
              <dd className="mt-1 font-heading text-2xl font-bold tabular-nums">{hasLoaded ? stats.orderCount : "—"}</dd>
            </div>
            <div className="pl-4">
              <dt className="text-sm text-text-secondary">Your earnings</dt>
              <dd className="mt-1 break-words font-heading text-2xl font-bold tabular-nums">{hasLoaded ? formatRupees(stats.earnings) : "—"}</dd>
            </div>
          </dl>
          {orders.length === PAGE_SIZE * MAX_PAGES && (
            <p className="mt-3 text-xs text-text-secondary">Based on your {orders.length} most recent orders.</p>
          )}
        </Panel>
      </main>

      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          autoOtp={detail.autoOtp}
          error={actionError}
          onClose={closeDetail}
          onAccept={(id) => updateOrder(id, "accept")}
          onReady={(id) => updateOrder(id, "ready")}
          onComplete={async (id, otp) => {
            if (await updateOrder(id, "complete", { otp })) closeDetail();
          }}
          actionLoading={busyId}
        />
      )}
    </DashboardLayout>
  );
}

function QueueRow({ order, stage, busyId, onDetails, onAction }) {
  const reference = orderRef(order);
  const count = order.documents?.length ?? 0;
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary-wash text-primary-deep">
          <FileText size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="break-words font-semibold">{order.customer_id?.name || "Customer"}</p>
          <p className="text-sm text-text-secondary">{reference} · {count} {count === 1 ? "file" : "files"}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {stage.status !== "pending" && (
          <button type="button" onClick={onDetails} aria-label={`Details for ${reference}`} className={secondary}>Details</button>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={busyId !== null}
          aria-label={`${stage.action} ${reference}`}
          className={`flex-1 sm:flex-none ${primary}`}
        >
          {busyId === order._id ? "Updating…" : stage.action}
        </button>
      </div>
    </li>
  );
}
