// The dashboard's shared surface. Every section on the page is one of
// these, so the card system (white, 1px border, teal-tinted shadow,
// 14-18px radius) is defined once rather than re-typed per section.
export default function Panel({ children, className = "", hoverable = false, as: Tag = "section", ...rest }) {
  return (
    <Tag
      className={`bg-surface border border-border rounded-panel shadow-card ${
        hoverable
          ? "transition-[box-shadow,transform] duration-200 motion-safe:hover:-translate-y-1 hover:shadow-card-hover"
          : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Title on the left, one optional action on the right. The action is a
// link or a button - never both, and never a row of them, so a section
// header stays a header.
export function PanelHeader({ title, subtitle, action, className = "" }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-heading font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Compact empty state. Deliberately small: an empty section should take
// up less room than a full one, not leave a large white hole in the page.
export function EmptyNote({ icon, title, hint, action }) {
  return (
    <div className="flex items-center gap-3 px-3 py-4 rounded-card bg-background-soft/60 border border-dashed border-border">
      {icon && (
        <span className="shrink-0 w-9 h-9 rounded-full bg-primary-wash grid place-items-center text-primary-bright">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        {hint && <span className="block text-xs text-text-secondary">{hint}</span>}
      </span>
      {action}
    </div>
  );
}
