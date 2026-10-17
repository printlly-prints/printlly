import { PaperPanel } from "./PaperUI";
import { effectiveShopStatus } from "../utils/shopStatus";

export default function QueueEstimate({ shop, queue, error }) {
  const closed = (queue?.effective_status || effectiveShopStatus(shop)) === "closed" || queue?.rush_basis === "closed";
  const observed = queue?.rush_basis === "recent_throughput";
  return <PaperPanel className="partner-action-panel">
    <h2>Live queue</h2>
    {error ? <p role="status">Queue estimate unavailable. Refresh to try again.</p> : !queue ? <p role="status">Loading queue estimate…</p> : <>
      <p className="analytics-queue-note">{queue.queued_orders_count ?? "—"} awaiting preparation · {queue.ready_orders_count ?? "—"} ready for pickup</p>
      {closed ? <p>Closed to new orders</p> : <>
        {["low", "medium", "high"].includes(queue.rush_level) && <p><strong>{queue.rush_level[0].toUpperCase() + queue.rush_level.slice(1)} rush</strong>{observed && Number.isFinite(queue.estimated_clearance_minutes) ? ` · About ${queue.estimated_clearance_minutes} min to clear current work` : ""}</p>}
        <p className="analytics-data-note">{observed ? "Estimated from recent preparation activity and the size of current jobs. This is not a promised pickup time." : "Based on queued order count while recent preparation history builds up."}</p>
      </>}
    </>}
  </PaperPanel>;
}
