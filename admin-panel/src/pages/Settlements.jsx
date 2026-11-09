import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import Avatar from "../components/Avatar";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  Badge,
  ErrorNote,
  Loading,
  PageHeader,
  Stat,
  TableShell,
  Td,
  Tr,
  formatRupees,
} from "../components/ui";

// The nightly payout ledger: pending vs settled per vendor.
//
// NOTHING ON THIS PAGE MOVES MONEY. The transfer is a UPI or bank payment
// an admin makes themselves, outside this platform; Settle records that it
// happened. The copy is deliberate about that everywhere, because a button
// labelled "settle" in a payments UI usually means "pay now", and here it
// does not.
//
// The backend already sorts longest-wait-first, so that order is not
// re-derived here.

const POLL_MS = 20 * 1000;
const OVERDUE_DAYS = 7;

const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default function Settlements() {
  const [date, setDate] = useState(todayInIndia);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [settling, setSettling] = useState(null);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [settleError, setSettleError] = useState("");
  const [done, setDone] = useState(null);

  // A slow response for a previous date must not overwrite the current one.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    if (!date) return;
    const request = ++latestRequest.current;
    try {
      const { data } = await api.get(`/admin/settlements/ledger?date=${date}`);
      if (request !== latestRequest.current) return;
      setLedger(data);
      setError("");
    } catch (err) {
      if (request !== latestRequest.current) return;
      setError(err.response?.data?.message || "Could not load the settlement ledger.");
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const startSettle = (row) => {
    setReference("");
    setSettleError("");
    setDone(null);
    setSettling(row);
  };

  const confirmSettle = async () => {
    setSaving(true);
    setSettleError("");
    try {
      // The ids this admin was shown, so an order completing while the
      // dialog is open waits for the next payout instead of being recorded
      // as paid.
      const { data } = await api.post(`/admin/settlements/shop/${settling.shop_id}/settle`, {
        order_ids: settling.pending_order_ids,
        reference_note: reference.trim(),
      });
      setDone({
        shop_name: settling.shop_name,
        total: data.settlement.total_amount,
        orders: data.settlement.order_count,
        reference: data.settlement.reference_note,
        remaining: data.remaining,
      });
      setSettling(null);
    } catch (err) {
      setSettleError(err.response?.data?.message || "Could not record this settlement.");
    } finally {
      setSaving(false);
      load();
    }
  };

  const rows = ledger?.rows || [];
  const totals = ledger?.totals;
  const isToday = date === todayInIndia();

  return (
    <AdminLayout>
      <PageHeader
        title="Daily Settlement"
        description="Pay vendors by UPI or bank at end of day, then Settle here to record it."
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">Settled on</span>
          <input
            type="date"
            value={date}
            max={todayInIndia()}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
          />
        </label>
      </PageHeader>

      {totals && (
        <div className="flex flex-wrap gap-3 mb-4">
          <Stat label="Pending now" value={formatRupees(totals.pending_amount)} />
          <Stat label={isToday ? "Settled today" : `Settled ${date}`} value={formatRupees(totals.settled_in_period)} />
          <Stat label="Next cycle" value={formatRupees(totals.next_cycle_amount)} />
        </div>
      )}

      {done && (
        <p role="status" className="mb-4 text-sm text-success-text bg-success-bg rounded-control p-3">
          Settled {formatRupees(done.total)} for {done.shop_name} ({done.orders} order
          {done.orders === 1 ? "" : "s"}){done.reference ? ` · ${done.reference}` : ""}.
          {done.remaining &&
            ` ${formatRupees(done.remaining.pending_amount + done.remaining.next_cycle_amount)} carries to the next payout.`}
        </p>
      )}

      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading the ledger..." />
      ) : (
        <TableShell
          headers={["Vendor", "Pending", "Settled on date", "Next cycle", "Status", ""]}
          empty={rows.length === 0 ? "No vendor has a balance yet." : null}
        >
          {rows.map((row) => (
            <Tr key={row.shop_id}>
              <Td>
                <Link to={`/shops/${row.shop_id}/activity`} className="flex items-center gap-2.5 group">
                  <Avatar src={row.logo_url} alt="" />
                  <span>
                    <span className="block font-medium text-primary-bright group-hover:text-primary-deep">
                      {row.shop_name}
                    </span>
                    <span className="block text-xs text-text-muted">{row.owner_name || "—"}</span>
                  </span>
                </Link>
              </Td>
              <Td className="whitespace-nowrap">
                <div className="font-semibold text-text-primary tabular-nums">{formatRupees(row.pending_amount)}</div>
                <div className="text-xs text-text-muted">
                  {row.pending_orders} order{row.pending_orders === 1 ? "" : "s"}
                  {waitingLabel(row.oldest_pending_at)}
                </div>
              </Td>
              <Td className="whitespace-nowrap">
                <div className="tabular-nums text-text-primary">{formatRupees(row.settled_in_period)}</div>
                <div className="text-xs text-text-muted">{formatRupees(row.settled_total)} to date</div>
              </Td>
              <Td className="whitespace-nowrap">
                <div className="tabular-nums text-text-primary">{formatRupees(row.next_cycle_amount)}</div>
                <div className="text-xs text-text-muted">{row.next_cycle_orders} in progress</div>
              </Td>
              <Td>
                {row.pending_orders > 0 ? (
                  <Badge value="unsettled" />
                ) : row.settled_total > 0 ? (
                  <Badge value="settled" />
                ) : (
                  <span className="text-text-muted">Nothing due</span>
                )}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-2">
                  <Link
                    to={`/settlements/${row.shop_id}`}
                    className="px-3 py-1.5 rounded-control border border-border text-sm font-medium text-text-primary whitespace-nowrap hover:bg-background-soft"
                  >
                    Review
                  </Link>
                  {row.pending_orders > 0 && (
                    <button
                      type="button"
                      onClick={() => startSettle(row)}
                      className="px-3 py-1.5 rounded-control bg-primary text-white text-sm font-medium whitespace-nowrap hover:bg-primary-deep"
                    >
                      Settle
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </TableShell>
      )}

      {settling && (
        <ConfirmDialog
          title={`Settle ${settling.shop_name}?`}
          confirmLabel={`Settle ${formatRupees(settling.pending_amount)}`}
          onConfirm={confirmSettle}
          onCancel={() => setSettling(null)}
          loading={saving}
          error={settleError}
        >
          <p>
            This records that you have already sent {formatRupees(settling.pending_amount)} for{" "}
            {settling.pending_orders} completed order{settling.pending_orders === 1 ? "" : "s"}. No money moves
            from here. Bank details are under Review.
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-text-secondary mb-1">Payment reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={200}
              placeholder="UPI transaction ID or bank reference"
              className="w-full px-3 py-2 border border-border rounded-control text-sm text-text-primary focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </label>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}

function waitingLabel(oldest) {
  if (!oldest) return "";
  const days = Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000);
  if (days <= 0) return "";
  return ` · ${days} day${days === 1 ? "" : "s"}${days >= OVERDUE_DAYS ? ", overdue" : ""}`;
}
