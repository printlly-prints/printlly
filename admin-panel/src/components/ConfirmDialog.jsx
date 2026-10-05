// Blocking confirmation for the actions in this panel that change
// something real for someone else: deactivating a vendor's shop, and
// saving platform pricing that every future order is charged against.
//
// Same shape as the vendor dashboard's own deactivation dialog, using the
// shared modal tokens (rounded-modal / shadow-modal). `destructive` picks
// the error-red confirm button; without it the confirm is the ordinary
// primary teal, since "save settings" is consequential but not a
// takedown.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  error = "",
  destructive = false,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-deep/75 p-4">
      <div className="bg-surface rounded-modal border border-border p-6 max-w-md w-full shadow-modal">
        <h3 className="font-heading font-bold text-text-primary">{title}</h3>
        <div className="text-sm text-text-secondary mt-2 space-y-2">{children}</div>

        {error && <p className="mt-3 text-sm text-error-text bg-error-bg rounded-control p-3">{error}</p>}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-control text-white text-sm font-medium disabled:opacity-50 ${
              destructive ? "bg-error hover:opacity-90" : "bg-primary hover:bg-primary-deep"
            }`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
