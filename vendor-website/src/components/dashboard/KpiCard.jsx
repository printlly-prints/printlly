import { Link } from "react-router-dom";
import Panel from "./Panel";

// One headline number. The comparison line underneath is optional
// because it is not always truthful to show one: with no orders
// yesterday there is no percentage to state, and "↑ 100%" from zero is a
// fabrication. Pass `note` for the honest sentence instead.
export default function KpiCard({ icon, label, value, note, tone = "teal", to }) {
  const tones = {
    teal: "bg-primary-wash text-primary-bright",
    green: "bg-background-soft text-leaf-natural",
    amber: "bg-status-pending-bg text-status-pending-text",
    success: "bg-success-bg text-success-text",
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`w-9 h-9 rounded-control grid place-items-center ${tones[tone]}`} aria-hidden="true">
          {icon}
        </span>
        {to && (
          <span className="text-text-muted text-xs transition-transform duration-200 group-hover:translate-x-0.5">
            →
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-medium text-text-secondary">{label}</p>
      <p className="font-heading text-2xl font-extrabold text-text-primary tabular-nums leading-tight">
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-text-muted">{note}</p>}
    </>
  );

  if (to) {
    return (
      <Panel
        as={Link}
        hoverable
        to={to}
        className="group block p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {body}
      </Panel>
    );
  }
  return (
    <Panel hoverable className="p-4">
      {body}
    </Panel>
  );
}

// The comparison line, written so it can never claim a change it cannot
// compute. Returns a plain string; the card renders it as-is.
export function comparisonNote(change, previousLabel) {
  if (change === null) return `No ${previousLabel} to compare with`;
  if (change === 0) return `Same as ${previousLabel}`;
  return `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% from ${previousLabel}`;
}
