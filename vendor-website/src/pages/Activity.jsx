import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import Panel, { EmptyNote } from "../components/dashboard/Panel";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import useOrderEvents from "../hooks/useOrderEvents";
import { orderRef } from "../utils/orderRef";
import { formatRupees } from "../utils/payout";

const PAGE_SIZE = 25;
const POLL_MS = 20 * 1000;

const STATUS_LABELS = {
  pending: "New",
  accepted: "Printing",
  ready_for_pickup: "Ready for pickup",
  completed: "Picked up",
  cancelled: "Cancelled",
  expired: "Expired",
};

const EVENT_LABELS = {
  placed: "Order placed",
  paid: "Payment confirmed",
  payment_failed: "Payment failed",
  accepted: "You accepted it",
  ready: "Marked ready",
  completed: "Picked up",
  expired: "Expired",
  settled: "Payout settled",
};

const formatTime = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// This shop's own request and dispatch log. GET /shops/me/activity resolves
// the shop from the token, so no other vendor's orders are reachable.
export default function Activity() {
  const { shop, user } = useAuth();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/shops/me/activity?limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`);
      setData(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your activity.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useOrderEvents(load);

  const orders = data?.orders || [];
  const summary = data?.summary;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto flex flex-col gap-4 motion-safe:animate-[printlly-rise_300ms_ease-out]">
        <Panel className="overflow-hidden">
          {shop?.shop_photo_url && <img src={shop.shop_photo_url} alt="" className="w-full h-32 object-cover" />}
          <div className="flex flex-wrap items-center gap-4 p-5">
            {shop?.shop_logo_url ? (
              <img src={shop.shop_logo_url} alt="" className="w-14 h-14 rounded-full object-cover border border-border" />
            ) : (
              <span aria-hidden="true" className="w-14 h-14 rounded-full bg-primary-wash text-primary-deep grid place-items-center font-heading text-xl font-bold">
                {shop?.shop_name?.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1 break-words">
              <h1 className="font-heading text-2xl font-bold text-text-primary">{shop?.shop_name}</h1>
              <p className="text-sm text-text-secondary">
                {[user?.name, shop?.address].filter(Boolean).join(" · ")}
              </p>
            </div>
            {shop?.owner_photo_url && (
              <img src={shop.owner_photo_url} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
            )}
          </div>
        </Panel>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Stat label="Print requests" value={summary.total_requests} />
            <Stat label="Pages printed" value={summary.printouts} />
            <Stat label="In progress" value={summary.in_progress} />
            <Stat label="Completed" value={summary.completed} />
            <Stat label="Earned" value={formatRupees(summary.earned)} className="col-span-2 xl:col-span-1" />
          </div>
        )}

        {error && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{error}</p>}

        {loading ? (
          <p className="p-8 text-center text-text-secondary">Loading...</p>
        ) : orders.length === 0 ? (
          !error && <EmptyNote title="No print requests yet" hint="Paid orders sent to your shop appear here." />
        ) : (
          <Panel as="ul" className="divide-y divide-border overflow-hidden">
            {orders.map((order) => (
              <LogRow key={order._id} order={order} />
            ))}
          </Panel>
        )}

        {data && (page > 0 || data.has_more) && (
          <div className="flex justify-end gap-2">
            <PageButton disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </PageButton>
            <PageButton disabled={!data.has_more} onClick={() => setPage((p) => p + 1)}>
              Next
            </PageButton>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function LogRow({ order }) {
  const pages = order.items.reduce((sum, item) => sum + item.pages * item.copies, 0);
  return (
    <li>
      <details className="group">
        <summary className="grid grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[5rem_minmax(0,1fr)_7.5rem_6.5rem] items-center gap-x-3 gap-y-1 px-5 py-3.5 cursor-pointer list-none hover:bg-background-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40">
          <span className="font-semibold text-text-primary tabular-nums">{orderRef(order)}</span>
          <span className="order-last col-span-full break-words text-sm text-text-secondary lg:order-none lg:col-span-1">
            {order.customer.name || "Customer"} · {pages} page{pages === 1 ? "" : "s"} · {formatTime(order.created_at)}
          </span>
          <span className="text-right text-sm font-medium text-text-secondary lg:text-left">{STATUS_LABELS[order.status] || order.status}</span>
          <span className="text-right font-semibold text-text-primary tabular-nums">{formatRupees(order.vendor_amount)}</span>
        </summary>

        <div className="grid gap-5 md:grid-cols-2 px-5 pb-5 pt-1">
          <div>
            <h3 className="text-xs font-semibold text-text-secondary mb-2">Printouts</h3>
            <ul className="space-y-2">
              {order.items.map((item, index) => (
                <li key={`${item.name}-${index}`} className="text-sm">
                  <span className="block text-text-primary break-all">{item.name || "Document"}</span>
                  <span className="block text-xs text-text-secondary">
                    {[`${item.pages} pages`, `${item.copies} cop${item.copies === 1 ? "y" : "ies"}`, item.color_mode, item.paper_size, item.sides, ...item.services]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            {order.instructions && (
              <p className="mt-2 text-xs text-text-secondary">Instructions: {order.instructions}</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold text-text-secondary mb-2">History</h3>
            <ol className="space-y-1.5">
              {order.timeline.map((entry, index) => (
                <li key={`${entry.event}-${index}`} className="flex justify-between gap-4 text-sm">
                  <span className="text-text-primary">{EVENT_LABELS[entry.event] || entry.event}</span>
                  <time dateTime={entry.at} className="text-text-secondary tabular-nums shrink-0">
                    {formatTime(entry.at)}
                  </time>
                </li>
              ))}
            </ol>
            {order.customer.phone && (
              <p className="mt-3 text-xs text-text-secondary">Sent by {order.customer.phone}</p>
            )}
            {order.settlement?.reference_note && (
              <p className="mt-1 text-xs text-text-secondary">Payout reference: {order.settlement.reference_note}</p>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

function Stat({ label, value, className = "" }) {
  return (
    <Panel className={`px-4 py-3 break-words ${className}`}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="font-heading text-lg font-bold text-text-primary tabular-nums mt-0.5">{value}</p>
    </Panel>
  );
}

function PageButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="px-3 py-1.5 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
