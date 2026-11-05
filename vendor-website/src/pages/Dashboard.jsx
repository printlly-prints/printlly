import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import VerificationBanner from "../components/VerificationBanner";
import OrderDetailPanel from "../components/OrderDetailPanel";
import { PaperRow } from "../components/PublicShell";
import { Button, PaperPanel } from "../components/PaperUI";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import useOrderEvents from "../hooks/useOrderEvents";
import { useEventSounds } from "../context/SoundContext";
import { effectiveShopStatus, SHOP_STATUSES } from "../utils/shopStatus";
import { orderRef } from "../utils/orderRef";
import { analyticsDateRange, partnerAnalytics, analyticsCSV } from "../utils/partnerAnalytics";
import { DateRangeControl, AnalyticsSummary, OrderAnalyticsCharts, downloadCSV } from "../components/PartnerAnalytics";
import QueueEstimate from "../components/QueueEstimate";
import MascotRecovery from "../components/MascotRecovery";

const ORDER_LABELS = { pending:"Pending", accepted:"Accepted", ready_for_pickup:"Ready for pickup", completed:"Completed", cancelled:"Cancelled", expired:"Expired" };
const ACTIVE = ["pending","accepted","ready_for_pickup"];

/** Active P04: all rows and availability remain sourced from the existing API. */
export default function Dashboard() {
  const { shop } = useAuth();
  const { confirm } = useEventSounds();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [range, setRange] = useState(() => analyticsDateRange(7));
  const [queue, setQueue] = useState(null);
  const [queueError, setQueueError] = useState(false);
  const shopId = shop?._id;
  const queueRequest = useRef(0);
  const actionRef = useRef(null);
  actionRef.current = actionLoading;

  const fetchOrders = useCallback(async () => {
    if (!shop) return [];
    try {
      const collected = [];
      for (let page = 0; page < 5; page += 1) {
        const { data } = await api.get(`/orders/shop/${shop._id}?limit=100&skip=${page * 100}`);
        if (!Array.isArray(data)) throw new Error("Order response was unavailable.");
        collected.push(...data);
        if (data.length < 100) break;
      }
      setOrders(collected); setError(""); setRequestError(null); return collected;
    } catch (err) { setRequestError(err); setError(err.response?.data?.message || "Could not load your orders."); return []; }
    finally { setLoading(false); }
  }, [shop]);

  const fetchQueue = useCallback(async () => {
    if (!shopId) return;
    const request = ++queueRequest.current;
    try {
      const { data } = await api.get("/shops/me");
      if (request !== queueRequest.current) return;
      if (String(data._id) !== String(shopId) || !data.queue) throw new Error("Queue unavailable");
      setQueue({ ...data.queue, effective_status: data.effective_status }); setQueueError(false);
    } catch { if (request === queueRequest.current) { setQueue(null); setQueueError(true); } }
  }, [shopId]);
  useEffect(() => {
    setQueue(null); fetchQueue();
    return () => { queueRequest.current += 1; };
  }, [fetchQueue]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useOrderEvents(async event => {
    fetchQueue();
    const fetched = await fetchOrders();
    const order = fetched.find(order => String(order._id) === String(event.orderId));
    if (order) await confirm(event, order);
  });
  useEffect(() => {
    const poll = () => { if (!document.hidden && !actionRef.current) { fetchOrders(); fetchQueue(); } };
    const interval = setInterval(poll, 15000);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [fetchOrders, fetchQueue]);

  async function updateOrder(id, request) {
    if (actionRef.current) return false;
    setActionLoading(id); setError("");
    try {
      const { data } = await request();
      setOrders(previous => previous.map(order => order._id === id ? data : order));
      fetchQueue();
      const event = { accepted: "ORDER_ACCEPTED", ready_for_pickup: "ORDER_READY_FOR_PICKUP", completed: "ORDER_COMPLETED" }[data.status];
      if (event) await confirm({ orderId: String(data._id), event }, data);
      return true;
    } catch (err) { setError(err.response?.data?.message || "Action failed. Please try again."); return false; }
    finally { setActionLoading(null); }
  }

  const active = useMemo(() => orders.filter(order => ACTIVE.includes(order.status)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)), [orders]);
  const detail = orders.find(order => order._id === detailId);
  const availability = SHOP_STATUSES.find(status => status.value === (queue?.effective_status || effectiveShopStatus(shop)));
  const report = useMemo(() => { try { return { analytics: partnerAnalytics(orders, range), error: "" }; } catch(err) { return { analytics: null, error: err.message }; } }, [orders, range]);
  if (requestError && !orders.length) return <DashboardLayout title="Overview"><div className="recovery-page"><MascotRecovery error={requestError} onRetry={fetchOrders} /></div></DashboardLayout>;
  return (
    <DashboardLayout title="Overview">
      <VerificationBanner shop={shop} />
      <div className="analytics-section-heading"><div><h1 className="partner-page-title">Overview</h1><p>Track orders, completed shop earnings, and the work needing your attention.</p></div><div className="dashboard-header-actions"><Button to="/availability" variant="text">{availability?.label || "Availability"}</Button><Button to="/orders">Open order queue</Button></div></div>
      {requestError ? <><MascotRecovery compact headingLevel={2} error={requestError} onRetry={fetchOrders} /><p className="analytics-data-note">Showing the last loaded orders. Their current status could not be checked.</p></> : error && <p role="alert" className="paper-error">{error}</p>}
      <QueueEstimate shop={shop} queue={queue} error={queueError} />
      <section className="analytics-section" aria-label="Order analytics">
        <div className="analytics-section-heading"><div><h2>Order analytics</h2><p>Completed shop earnings for orders placed in the selected range.</p></div><Button variant="secondary" disabled={!report.analytics || loading || !!error} onClick={() => downloadCSV(analyticsCSV(orders, range),`printlly-orders-${range.startDate}-${range.endDate}.csv`)}>Export orders CSV</Button></div>
        <DateRangeControl range={range} onChange={setRange} />
        {report.error && <p role="alert" className="paper-error">{report.error}</p>}
        {!error && <><AnalyticsSummary analytics={report.analytics} loading={loading} />{!loading && <OrderAnalyticsCharts analytics={report.analytics} />}</>}
        <p className="analytics-data-note">Based on {orders.length} loaded orders, limited to the latest 500. {orders.length >= 500 ? "Older orders may be excluded; these figures are not a complete account report." : "Dates use when an order was placed, in Indian Standard Time."}</p>
      </section>
      <PaperPanel className="partner-action-panel">
        <h2>Orders needing action</h2>
        <p className="analytics-queue-note">Across all loaded dates · {active.filter(order => order.status === "pending").length} pending · {active.filter(order => order.status === "accepted").length} accepted · {active.filter(order => order.status === "ready_for_pickup").length} ready for pickup</p>
        {loading ? <p role="status">Loading your orders…</p> : active.length ? active.slice(0,5).map(order => (
          <button key={order._id} className="paper-row partner-order-row" onClick={() => setDetailId(order._id)}>
            <span><strong>{orderRef(order)} · {order.customer_id?.name || "Customer"}</strong><small>{ORDER_LABELS[order.status]} · {order.documents?.length || 0} {order.documents?.length === 1 ? "file" : "files"}</small></span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        )) : <div className="partner-empty"><h3>A quiet moment.</h3><p>New orders will appear here.</p></div>}
      </PaperPanel>
      <PaperRow className="partner-availability-row" to="/availability" title="Shop availability" detail={availability?.label === "Open" ? "Open for new orders" : availability?.label === "Busy" ? "Busy · accepting orders with an estimated wait" : "Closed to new orders"} />
      <Button variant="text" onClick={() => { fetchOrders(); fetchQueue(); }} className="partner-refresh">Refresh orders and queue</Button>
      {detail && <OrderDetailPanel order={detail} onClose={() => setDetailId(null)} actionError={error} onAccept={id => updateOrder(id, () => api.patch(`/orders/${id}/accept`))} onReady={id => updateOrder(id, () => api.patch(`/orders/${id}/ready`))} onComplete={async (id,otp) => { if (await updateOrder(id, () => api.patch(`/orders/${id}/complete`, { otp }))) setDetailId(null); }} actionLoading={actionLoading} />}
    </DashboardLayout>
  );
}
