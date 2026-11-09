import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import {
  Badge,
  ErrorNote,
  Loading,
  PageHeader,
  TableShell,
  Td,
  Timeline,
  Tr,
  formatDate,
  formatRupees,
  orderRef,
} from "../components/ui";

const POLL_MS = 20 * 1000;

// One order from placement to payout, for working through a complaint.
// Read-only, like the Orders list.
export default function OrderTrace() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/orders/${id}`);
      setOrder(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <AdminLayout>
      <Link to="/orders" className="text-sm text-primary-bright hover:text-primary-deep">
        Back to orders
      </Link>
      <div className="mt-2">
        <PageHeader
          title={order ? `Order ${orderRef(order._id)}` : "Order"}
          description={order ? `Placed ${formatDate(order.created_at)}` : undefined}
        >
          {order && (
            <div className="flex flex-wrap gap-2">
              <Badge value={order.status} />
              <Badge value={order.payment_status} />
              <Badge value={order.settlement_status} />
            </div>
          )}
        </PageHeader>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading order..." />
      ) : (
        order && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Lifecycle">
              <Timeline events={order.timeline} />
            </Section>

            <Section title="Who">
              <Row label="Sent by" value={order.customer.name} />
              <Row label="Phone" value={order.customer.phone} />
              <Row label="Email" value={order.customer.email} />
              <Row
                label="Sent to"
                value={
                  order.shop?._id ? (
                    <Link to={`/shops/${order.shop._id}/activity`} className="text-primary-bright hover:text-primary-deep">
                      {order.shop.shop_name}
                    </Link>
                  ) : null
                }
              />
              <Row label="Shop contact" value={order.shop?.contact} />
            </Section>

            <Section title="Money">
              <Row label="Customer paid" value={formatRupees(order.total_amount)} />
              <Row label="Platform fee" value={formatRupees(order.platform_fee)} />
              <Row label="Vendor share" value={formatRupees(order.vendor_amount)} />
              <Row label="Razorpay order" value={order.razorpay_order_id} mono />
              <Row label="Razorpay payment" value={order.razorpay_payment_id} mono />
            </Section>

            <Section title="Payout">
              <Row label="Status" value={<Badge value={order.settlement_status} />} />
              <Row label="Settled on" value={order.settlement && formatDate(order.settlement.settled_at)} />
              <Row label="Settled by" value={order.settlement?.settled_by_name} />
              <Row label="Reference" value={order.settlement?.reference_note} mono />
            </Section>

            <div className="lg:col-span-2">
              <TableShell headers={["Document", "Pages", "Copies", "Print", "Services", "Total"]}>
                {order.items.map((item, index) => (
                  <Tr key={`${item.name}-${index}`}>
                    <Td className="text-text-primary break-all">{item.name || "—"}</Td>
                    <Td>{item.pages}</Td>
                    <Td>{item.copies}</Td>
                    <Td className="whitespace-nowrap text-text-secondary">
                      {[item.color_mode, item.paper_size, item.sides].filter(Boolean).join(" · ") || "—"}
                    </Td>
                    <Td className="text-text-secondary">{item.services.join(", ") || "—"}</Td>
                    <Td className="whitespace-nowrap">{item.total === null ? "—" : formatRupees(item.total)}</Td>
                  </Tr>
                ))}
              </TableShell>
              {order.instructions && (
                <p className="mt-3 text-sm text-text-secondary">Instructions: {order.instructions}</p>
              )}
            </div>
          </div>
        )
      )}
    </AdminLayout>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-surface border border-border rounded-panel p-5">
      <h2 className="font-heading font-bold text-text-primary mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`text-text-primary break-all ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
    </div>
  );
}
