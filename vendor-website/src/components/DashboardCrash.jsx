import Logo from "./Logo";

// What a vendor sees if the dashboard throws during render.
//
// Without an error boundary React unmounts the whole tree, which leaves a
// blank white page - the single worst failure state a web application has,
// because it is indistinguishable from a dead server and tells the person
// nothing they can act on. A shop owner looking at a blank screen mid-shift
// does not know whether to wait, reload, or ring their customer.
//
// What this deliberately does NOT show: the error message or the stack
// trace. They mean nothing to a shop owner, and a stack trace in a vendor's
// browser names our files and framework to anyone standing at the counter.
// The detail goes to Sentry, which is where someone who can act on it will
// look. See lib/observability.js.
//
// Reassurance about orders is the most useful thing on this screen, and it is
// also true: the backend is the source of truth, so nothing a customer has
// paid for is affected by the dashboard failing to draw.
export default function DashboardCrash({ onRetry }) {
  return (
    <div className="min-h-screen bg-background-page flex items-center justify-center px-5">
      <div className="max-w-[440px] w-full bg-surface border border-border rounded-panel p-7 text-center">
        <div className="flex justify-center mb-4">
          <Logo size={40} />
        </div>

        <h1 className="font-heading text-[19px] font-bold text-text-primary">
          Something went wrong
        </h1>

        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          The dashboard hit an unexpected problem and could not finish loading
          this screen. Your orders and your shop are unaffected - nothing has
          been lost.
        </p>

        <p className="mt-2.5 text-[13px] leading-relaxed text-text-secondary">
          Our team has been notified automatically. Trying again usually works.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          {/* resetError from the boundary, which re-renders the subtree. A
              genuinely transient error clears here without the vendor losing
              their session, which a full reload would risk. */}
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          {/* The escape hatch for an error that re-throws immediately on
              re-render, where "Try again" would loop. */}
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="px-4 py-2.5 rounded-lg border border-border text-text-primary text-[14px] font-semibold hover:bg-background-soft transition-colors"
          >
            Reload the dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
