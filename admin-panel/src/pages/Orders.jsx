import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import {
  Badge,
  ErrorNote,
  FilterSelect,
  Loading,
  PageHeader,
  TableShell,
  Td,
  TextFilter,
  Tr,
  formatDate,
  formatRupees,
  orderRef,
} from "../components/ui";

const PAGE_SIZE = 25;

// Read-only oversight of every order on the platform.
//
// There are no action buttons here on purpose, mirroring the backend:
// GET /admin/orders is the only order route an admin has, and no admin
// route can change an order's status. Accepting, marking ready and
// completing stay with the shop doing the work, and completing still
// needs the customer's pickup OTP.
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [ref, setRef] = useState("");
  // Only a complete reference is searched; a half-typed one has no answer.
  const refQuery = /^(PL)?[0-9a-f]{6,24}$/i.test(ref.trim()) ? ref.trim() : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (refQuery) params.set("ref", refQuery);
      if (status) params.set("status", status);
      if (paymentStatus) params.set("payment_status", paymentStatus);
      if (from) params.set("from", from);
      // A date input gives midnight; without this an end date would
      // exclude everything that happened during that day itself.
      if (to) params.set("to", `${to}T23:59:59.999`);
      params.set("limit", String(PAGE_SIZE));
      params.set("skip", String(page * PAGE_SIZE));

      const { data } = await api.get(`/admin/orders?${params.toString()}`);
      setOrders(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [status, paymentStatus, from, to, page, refQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change invalidates the current page number - staying on
  // page 3 of a different result set would show an arbitrary window.
  useEffect(() => {
    setPage(0);
  }, [status, paymentStatus, from, to, refQuery]);

  // Shop/customer search is applied client-side over the fetched page:
  // the backend filters orders by shop_id/customer_id (ids, not names),
  // and a support lookup is usually "find this name on the current page"
  // rather than a platform-wide text search. Labelled accordingly below
  // so it doesn't read as a global search that silently misses matches.
  const visible = search.trim()
    ? orders.filter((o) => {
        const needle = search.trim().toLowerCase();
        return (
          (o.shop_id?.shop_name || "").toLowerCase().includes(needle) ||
          (o.customer_id?.name || "").toLowerCase().includes(needle) ||
          (o.customer_id?.phone || "").includes(needle)
        );
      })
    : orders;

  return (
    <AdminLayout>
      <PageHeader
        title="Orders"
        description="Read-only. Admins can look orders up for support, but never change their status."
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Any" },
            { value: "pending", label: "Pending" },
            { value: "accepted", label: "Accepted" },
            { value: "ready_for_pickup", label: "Ready for pickup" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "expired", label: "Expired" },
          ]}
        />
        <FilterSelect
          label="Payment"
          value={paymentStatus}
          onChange={setPaymentStatus}
          options={[
            { value: "", label: "Any" },
            { value: "paid", label: "Paid" },
            { value: "created", label: "Payment pending" },
            { value: "failed", label: "Payment failed" },
          ]}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
          />
        </label>
        <TextFilter label="Order reference" value={ref} onChange={setRef} placeholder="PL1A2B3C" />
        <TextFilter
          label="Find on this page"
          value={search}
          onChange={setSearch}
          placeholder="Shop or customer"
        />
      </div>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading orders..." />
      ) : (
        <>
          <TableShell
            headers={["Ref", "Placed", "Shop", "Customer", "Order", "Status", "Payment", "Total"]}
            empty={visible.length === 0 ? "No orders match these filters." : null}
          >
            {visible.map((order) => (
              <Tr key={order._id}>
                <Td className="whitespace-nowrap">
                  <Link to={`/orders/${order._id}`} className="font-medium text-primary-bright hover:text-primary-deep">
                    {orderRef(order._id)}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-text-secondary">{formatDate(order.createdAt)}</Td>
                <Td className="text-text-primary">{order.shop_id?.shop_name || "—"}</Td>
                <Td>
                  <div className="text-text-primary">{order.customer_id?.name || "—"}</div>
                  <div className="text-xs text-text-muted">{order.customer_id?.phone || "—"}</div>
                </Td>
                <Td className="text-text-secondary whitespace-nowrap">
                  {/* Print settings are per document now - an admin list
                      row shows the count; the detail lives with the order. */}
                  {order.documents?.length ?? 0} doc
                  {(order.documents?.length ?? 0) === 1 ? "" : "s"}
                </Td>
                <Td>
                  <Badge value={order.status} />
                </Td>
                <Td>
                  <Badge value={order.payment_status} />
                </Td>
                <Td className="whitespace-nowrap tabular-nums text-text-primary">
                  {formatRupees(order.total_amount)}
                </Td>
              </Tr>
            ))}
          </TableShell>

          {/* Skip/limit paging with no total count - the API returns a
              plain array, so "there might be more" is inferred from a
              full page rather than a total the server doesn't send. */}
          <div className="flex items-center justify-between gap-3 mt-3">
            <p className="text-xs text-text-muted">
              Showing {visible.length} order{visible.length === 1 ? "" : "s"}
              {search.trim() && ` (filtered from ${orders.length} on this page)`} · page {page + 1}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={orders.length < PAGE_SIZE}
                className="px-3 py-1.5 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
