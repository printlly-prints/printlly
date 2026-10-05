// The handful of primitives every table-heavy page here repeats. Kept in
// one file rather than one file each: none of them is more than a styled
// element, and splitting them further would be more imports than
// substance.

// Page heading + optional one-line description.
export function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="font-heading text-xl font-bold text-text-primary">{title}</h1>
        {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// Scroll container + consistent chrome for every table on the panel.
// overflow-x-auto matters on the denser tables (orders especially) -
// without it a narrow window silently clips columns instead of letting
// them scroll.
export function TableShell({ headers, children, empty, colSpan }) {
  return (
    <div className="bg-surface border border-border rounded-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background-soft">
              {headers.map((h) => (
                <th key={h} className="text-left font-medium text-text-secondary px-4 py-2.5 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td colSpan={colSpan || headers.length} className="px-4 py-10 text-center text-text-secondary">
                  {empty}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

export function Tr({ children }) {
  return <tr className="border-b border-border last:border-b-0 hover:bg-background-soft/60">{children}</tr>;
}

// Status pill. Colour is never the only signal - the label always says
// the same thing the colour does, so this reads fine without colour
// vision.
const BADGE_STYLES = {
  pending: "bg-status-pending-bg text-status-pending-text",
  approved: "bg-status-ready-bg text-status-ready-text",
  rejected: "bg-error-bg text-error-text",
  active: "bg-status-ready-bg text-status-ready-text",
  inactive: "bg-status-done-bg text-status-done-text",
  accepted: "bg-status-active-bg text-status-active-text",
  ready_for_pickup: "bg-status-ready-bg text-status-ready-text",
  completed: "bg-status-done-bg text-status-done-text",
  cancelled: "bg-error-bg text-error-text",
  expired: "bg-status-done-bg text-status-done-text",
  paid: "bg-status-ready-bg text-status-ready-text",
  created: "bg-status-pending-bg text-status-pending-text",
  failed: "bg-error-bg text-error-text",
};

const BADGE_LABELS = {
  ready_for_pickup: "Ready for pickup",
  created: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
};

export function Badge({ value }) {
  if (!value) return <span className="text-text-muted">—</span>;
  const style = BADGE_STYLES[value] || "bg-status-done-bg text-status-done-text";
  const label = BADGE_LABELS[value] || value.charAt(0).toUpperCase() + value.slice(1);
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}>
      {label}
    </span>
  );
}

// Filter <select> with a consistent label, used across Shops and Orders.
export function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-border rounded-control text-sm bg-surface focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextFilter({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-1.5 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
      />
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="text-sm text-error-text bg-error-bg rounded-control p-3 mb-4">{children}</p>;
}

export function Loading({ label = "Loading..." }) {
  return <div className="py-10 text-center text-sm text-text-secondary">{label}</div>;
}

// Rupee formatting, used by the dashboard's revenue card and the orders
// table. Indian digit grouping, no decimals - every amount in this system
// is already rounded to at most 2dp server-side, and whole rupees is what
// an operator scanning a table actually wants.
export function formatRupees(value) {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
