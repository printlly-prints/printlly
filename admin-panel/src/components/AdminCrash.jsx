// What an admin sees if the panel throws during render.
//
// Without an error boundary React unmounts the whole tree and leaves a blank
// white page, which tells the person nothing and is indistinguishable from a
// dead server.
//
// No error message and no stack trace. Even though the audience here is
// internal, the reasoning still holds: a stack trace on screen is one
// screenshot away from being pasted into a ticket, and the detail belongs in
// Sentry where it is already behind authentication. See lib/observability.js.
export default function AdminCrash({ onRetry }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="max-w-[420px] w-full bg-surface border border-border rounded-panel p-7 text-center">
        <h1 className="text-[18px] font-bold text-text-primary">
          The admin panel hit an error
        </h1>

        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          This screen could not finish loading. Nothing has been changed - no
          verification, settlement or order was affected by this.
        </p>

        <p className="mt-2.5 text-[13px] leading-relaxed text-text-secondary">
          The error has been reported automatically.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2.5 rounded-lg bg-primary text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="px-4 py-2.5 rounded-lg border border-border text-text-primary text-[14px] font-semibold hover:bg-primary-wash transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
