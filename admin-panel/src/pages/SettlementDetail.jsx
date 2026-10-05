import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  ErrorNote,
  Loading,
  PageHeader,
  TableShell,
  Td,
  Tr,
  formatDate,
  formatRupees,
} from "../components/ui";

// One shop: where to send the money, exactly what it covers, and what has
// been sent before.
//
// A separate page rather than a modal, on purpose. The admin is going to
// leave this screen - to their banking app or UPI - make the transfer,
// and come back with a reference number. A URL survives that; a modal
// over a list does not, and a modal also has to hold bank details, a
// selectable order list and a history table at once.
//
// AGAIN: nothing here moves money. "Mark as settled" writes a record that
// a transfer the admin made themselves has happened.
export default function SettlementDetail() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which orders this payment covers. Everything outstanding is selected
  // to begin with, because paying the whole balance is the ordinary case
  // - unchecking is how a partial payment gets made, rather than making
  // the common case the fiddly one.
  const [selected, setSelected] = useState(() => new Set());
  const [reference, setReference] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/settlements/shop/${shopId}`);
      setData(res.data);
      setSelected(new Set(res.data.unsettled.orders.map((o) => o._id)));
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this shop's settlement details.");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    load();
  }, [load]);

  const orders = data?.unsettled.orders || [];
  const payout = data?.payout;

  // Summed from what is actually ticked, so the figure in the confirm
  // dialog is the figure the admin is about to record paying.
  const selectedTotal = useMemo(
    () =>
      Math.round(
        orders.filter((o) => selected.has(o._id)).reduce((sum, o) => sum + (o.vendor_amount || 0), 0) * 100
      ) / 100,
    [orders, selected]
  );

  const allSelected = orders.length > 0 && selected.size === orders.length;
  const hasPayout = !!(payout && ((payout.account_number && payout.ifsc_code) || payout.upi_id));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const settle = async () => {
    setWorking(true);
    setActionError("");
    try {
      const res = await api.post(`/admin/settlements/shop/${shopId}/settle`, {
        // Always explicit, even when everything is ticked: the backend
        // accepts an omitted list to mean "all outstanding", but that
        // would settle anything that arrived since this page loaded -
        // orders the admin never saw and did not pay for.
        order_ids: [...selected],
        reference_note: reference.trim(),
      });
      setConfirming(false);
      setDone(res.data.settlement);
      setReference("");
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || "Could not record that settlement.");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <Loading label="Loading settlement details..." />
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <ErrorNote>{error || "Shop not found."}</ErrorNote>
        <Link to="/settlements" className="text-sm font-medium text-primary-bright hover:text-primary-deep">
          ← Back to settlements
        </Link>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Link
        to="/settlements"
        className="inline-block mb-3 text-sm font-medium text-primary-bright hover:text-primary-deep"
      >
        ← Back to settlements
      </Link>

      <PageHeader
        title={data.shop.shop_name}
        description={`${data.shop.owner_name || "Unknown owner"}${
          data.shop.owner_email ? ` · ${data.shop.owner_email}` : ""
        }`}
      />

      {done && (
        <div className="mb-4 rounded-panel border border-status-ready-text/25 bg-status-ready-bg px-4 py-3">
          <p className="text-sm font-semibold text-status-ready-text">
            Recorded: {formatRupees(done.total_amount)} across {done.order_count} order
            {done.order_count === 1 ? "" : "s"}
            {done.reference_note ? ` · ${done.reference_note}` : ""}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            This is a record only — make sure the transfer itself has actually been sent.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start">
        {/* --- where to send it ------------------------------------- */}
        <section className="bg-surface border border-border rounded-panel p-4">
          <h2 className="font-heading font-bold text-text-primary">Payout details</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Entered by the vendor. Check these against what you are about to send.
          </p>

          {hasPayout ? (
            <dl className="mt-3 space-y-3">
              <PayoutField label="Account holder" value={payout.account_holder_name} />
              {/* Selectable and monospaced-ish: these get copied into a
                  banking app character by character, so they are spaced
                  for reading digits rather than prose. */}
              <PayoutField label="Account number" value={payout.account_number} mono />
              <PayoutField label="IFSC" value={payout.ifsc_code} mono />
              <PayoutField label="UPI ID" value={payout.upi_id} mono />
              {payout.updated_at && (
                <div>
                  <dt className="text-xs text-text-secondary">Last changed</dt>
                  <dd className="text-sm text-text-primary mt-0.5">{formatDate(payout.updated_at)}</dd>
                </div>
              )}
            </dl>
          ) : (
            // Worth stopping for: there is nothing to pay into, so the
            // settle action below would record a transfer that could not
            // have been made.
            <p className="mt-3 text-sm text-status-pending-text bg-status-pending-bg rounded-control p-3">
              This vendor hasn&rsquo;t added payout details yet, so there is nowhere to send their
              money. Ask them to fill these in before recording a settlement.
            </p>
          )}
        </section>

        {/* --- what it covers --------------------------------------- */}
        <section className="bg-surface border border-border rounded-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading font-bold text-text-primary">Unsettled orders</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Completed and paid for, not yet settled. Untick any this payment does not cover.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-secondary">Selected</p>
              <p className="font-heading text-xl font-bold text-text-primary tabular-nums">
                {formatRupees(selectedTotal)}
              </p>
            </div>
          </div>

          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-text-secondary">
              Nothing outstanding — everything completed here has been settled.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(orders.map((o) => o._id)))
                    }
                    className="w-4 h-4 accent-primary"
                  />
                  Select all ({orders.length})
                </label>
                <span className="text-xs text-text-secondary tabular-nums">
                  {selected.size} of {orders.length} selected
                </span>
              </div>

              <div className="mt-3 max-h-80 overflow-y-auto border border-border rounded-control">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background-soft">
                    <tr className="border-b border-border">
                      <th scope="col" className="w-10 px-3 py-2" />
                      <th scope="col" className="text-left font-medium text-text-secondary px-3 py-2">
                        Order
                      </th>
                      <th scope="col" className="text-left font-medium text-text-secondary px-3 py-2">
                        Completed
                      </th>
                      <th scope="col" className="text-right font-medium text-text-secondary px-3 py-2">
                        Vendor gets
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order._id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(order._id)}
                            onChange={() => toggle(order._id)}
                            aria-label={`Include order ${shortId(order._id)}`}
                            className="w-4 h-4 accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                          {shortId(order._id)}
                        </td>
                        <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-primary whitespace-nowrap">
                          {formatRupees(order.vendor_amount)}
                          {/* The split, so an admin can see the fee was
                              taken out and this is not the order total. */}
                          <span className="block text-[11px] text-text-muted">
                            {formatRupees(order.total_amount)} − {formatRupees(order.platform_fee)} fee
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* --- reference + action ------------------------------ */}
              <div className="mt-4 pt-4 border-t border-border">
                <label htmlFor="settle-reference" className="text-sm font-medium text-text-primary">
                  Payment reference
                </label>
                <input
                  id="settle-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI transaction ID or bank reference"
                  maxLength={200}
                  className="mt-1.5 w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
                <p className="text-xs text-text-secondary mt-1">
                  Optional, but without it neither you nor the vendor can match this against a bank
                  statement later.
                </p>

                <button
                  type="button"
                  disabled={selected.size === 0}
                  onClick={() => {
                    setActionError("");
                    setConfirming(true);
                  }}
                  className="mt-3 px-4 py-2 rounded-control bg-primary text-white text-sm font-semibold hover:bg-primary-deep disabled:opacity-50"
                >
                  Mark as settled
                </button>
                {selected.size === 0 && (
                  <span className="ml-3 text-xs text-text-secondary">Select at least one order.</span>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* --- what has already been sent --------------------------- */}
      <section className="mt-4">
        <h2 className="font-heading font-bold text-text-primary mb-2">Past settlements</h2>
        <TableShell
          headers={["Date", "Amount", "Orders", "Reference", "Recorded by"]}
          empty={data.settlements.length === 0 ? "No settlements recorded for this shop yet." : null}
        >
          {data.settlements.map((row) => (
            <Tr key={row._id}>
              <Td className="whitespace-nowrap text-text-secondary">{formatDate(row.settled_at)}</Td>
              <Td className="tabular-nums font-semibold text-text-primary whitespace-nowrap">
                {formatRupees(row.total_amount)}
              </Td>
              <Td className="tabular-nums text-text-secondary">{row.order_count}</Td>
              <Td className="text-text-secondary break-all">
                {row.reference_note || <span className="text-text-muted">—</span>}
              </Td>
              <Td className="text-text-secondary">{row.settled_by_name || "—"}</Td>
            </Tr>
          ))}
        </TableShell>
      </section>

      {confirming && (
        <ConfirmDialog
          title="Record this settlement?"
          confirmLabel="Yes, mark as settled"
          loading={working}
          error={actionError}
          onCancel={() => setConfirming(false)}
          onConfirm={settle}
        >
          <p>
            You are recording that{" "}
            <span className="font-semibold text-text-primary">{formatRupees(selectedTotal)}</span> has
            been sent to{" "}
            <span className="font-semibold text-text-primary">{data.shop.shop_name}</span> for{" "}
            {selected.size} order{selected.size === 1 ? "" : "s"}.
          </p>
          {/* The single most important sentence on this screen. */}
          <p className="font-medium text-text-primary">
            This does not send any money. Only confirm if you have already made the transfer.
          </p>
          {reference.trim() ? (
            <p>
              Reference: <span className="font-mono text-text-primary">{reference.trim()}</span>
            </p>
          ) : (
            <p className="text-status-pending-text">
              No reference recorded — this payment won&rsquo;t be matchable against a bank statement
              later.
            </p>
          )}
          {!hasPayout && (
            <p className="text-status-pending-text">
              This vendor has no payout details on file, so there was nowhere to send it.
            </p>
          )}
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}

function PayoutField({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd
        className={`text-sm mt-0.5 break-all ${
          value ? `text-text-primary ${mono ? "font-mono tracking-wide" : ""}` : "text-text-muted"
        }`}
      >
        {value || "Not set"}
      </dd>
    </div>
  );
}

// Orders are referred to by the tail of their id everywhere a human reads
// one in this product - a full ObjectId is unreadable in a table and
// unquotable over a phone call.
function shortId(id) {
  return `#${String(id).slice(-6).toUpperCase()}`;
}
