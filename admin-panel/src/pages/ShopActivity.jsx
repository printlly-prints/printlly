import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import Avatar from "../components/Avatar";
import {
  Badge,
  ErrorNote,
  Loading,
  Stat,
  TableShell,
  Td,
  Tr,
  formatDate,
  formatRupees,
  orderRef,
} from "../components/ui";

const PAGE_SIZE = 25;
const POLL_MS = 20 * 1000;

// One vendor's full request and dispatch history, including unpaid attempts
// the vendor themselves never sees.
export default function ShopActivity() {
  const { shopId } = useParams();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/admin/shops/${shopId}/activity?limit=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`);
      setData(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this vendor's activity.");
    } finally {
      setLoading(false);
    }
  }, [shopId, page]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const shop = data?.shop;
  const orders = data?.orders || [];

  return (
    <AdminLayout>
      <Link to="/settlements" className="text-sm text-primary-bright hover:text-primary-deep">
        Back to Daily Settlement
      </Link>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading vendor activity..." />
      ) : (
        shop && (
          <>
            <header className="mt-3 mb-5 bg-surface border border-border rounded-panel overflow-hidden">
              {shop.shop_photo_url && (
                <img src={shop.shop_photo_url} alt="" className="w-full h-32 object-cover" />
              )}
              <div className="flex flex-wrap items-center gap-4 p-5">
                <Avatar src={shop.shop_logo_url || shop.shop_photo_url} alt="" size={56} />
                <div className="min-w-0 flex-1">
                  <h1 className="font-heading text-xl font-bold text-text-primary">{shop.shop_name}</h1>
                  <p className="text-sm text-text-secondary">{shop.address}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <Avatar src={shop.owner_photo_url} alt="" kind="owner" size={40} />
                  <div className="text-sm">
                    <p className="font-medium text-text-primary">{shop.owner_id?.name || "—"}</p>
                    <p className="text-xs text-text-muted">{shop.owner_id?.email || shop.contact}</p>
                  </div>
                </div>
              </div>
            </header>

            <div className="flex flex-wrap gap-3 mb-4">
              <Stat label="Print requests" value={data.summary.total_requests} />
              <Stat label="Pages printed" value={data.summary.printouts} />
              <Stat label="In progress" value={data.summary.in_progress} />
              <Stat label="Completed" value={data.summary.completed} />
              <Stat label="Pending payout" value={formatRupees(data.balance.pending_amount)} />
              <Stat label="Settled to date" value={formatRupees(data.balance.settled_total)} />
            </div>

            <TableShell
              headers={["Order", "Placed", "Sent by", "Printouts", "Status", "Payment", "Payout", "Vendor share"]}
              empty={orders.length === 0 ? "No orders for this vendor yet." : null}
            >
              {orders.map((order) => (
                <Tr key={order._id}>
                  <Td className="whitespace-nowrap">
                    <Link to={`/orders/${order._id}`} className="font-medium text-primary-bright hover:text-primary-deep">
                      {orderRef(order._id)}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-text-secondary">{formatDate(order.created_at)}</Td>
                  <Td>
                    <div className="text-text-primary">{order.customer.name || "—"}</div>
                    <div className="text-xs text-text-muted">{order.customer.phone || "—"}</div>
                  </Td>
                  <Td className="text-text-secondary">
                    {order.items.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="break-all">
                        {item.name || "Document"} · {item.pages}p × {item.copies}
                      </div>
                    ))}
                  </Td>
                  <Td><Badge value={order.status} /></Td>
                  <Td><Badge value={order.payment_status} /></Td>
                  <Td><Badge value={order.settlement_status} /></Td>
                  <Td className="whitespace-nowrap text-text-primary">{formatRupees(order.vendor_amount)}</Td>
                </Tr>
              ))}
            </TableShell>

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-xs text-text-muted">Page {page + 1}</p>
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
                  disabled={!data.has_more}
                  className="px-3 py-1.5 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )
      )}
    </AdminLayout>
  );
}
