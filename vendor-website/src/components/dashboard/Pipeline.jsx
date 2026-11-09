import { useNavigate } from "react-router-dom";
import { pipelineCounts } from "../../utils/dashboardStats";

// The vendor's whole day in one strip: what has arrived, what is on the
// printer, what is waiting on the counter, what has gone. Each step is a
// button that opens the Orders page already filtered to that status, so
// the summary is also the way in.
//
// The steps are the backend's real statuses. See PIPELINE in
// dashboardStats.js for why "Printing" is the accepted state rather than
// a stage of its own.
export default function Pipeline({ orders }) {
  const navigate = useNavigate();
  const steps = pipelineCounts(orders);

  return (
    <ol className="flex items-stretch gap-1.5 overflow-x-auto">
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-stretch gap-1.5 flex-1 min-w-[112px]">
          <button
            type="button"
            onClick={() => navigate(`/orders?status=${step.key}`)}
            title={step.hint}
            className="group flex-1 text-left px-3 py-2.5 rounded-card border border-border bg-surface hover:bg-primary-wash hover:border-primary/30 transition-[background-color,border-color,box-shadow] duration-200 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="block text-[11px] font-medium text-text-secondary group-hover:text-primary-deep">
              {step.label}
            </span>
            <span className="block font-heading text-xl font-semibold text-text-primary tabular-nums leading-tight">
              {step.count}
            </span>
          </button>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="self-center text-text-muted text-sm">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
