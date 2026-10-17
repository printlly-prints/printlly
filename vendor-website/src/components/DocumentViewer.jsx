import { useEffect, useRef, useState } from "react";
import api from "../api/axios";
import useDialogFocus from "../hooks/useDialogFocus";
import MascotRecovery from "./MascotRecovery";

// Full-screen viewer for one customer document.
//
// A vendor is meant to READ and PRINT what a customer sent, not keep a
// copy - so this deliberately replaces the old plain <a href={file_url}>,
// which opened Cloudinary's URL in a tab and handed the browser a
// ready-made "Save as" (and leaked the unauthenticated storage URL into
// the address bar along the way).
//
// The PDF is fetched as a blob through GET /orders/:id/documents/:i/view
// (auth-checked, streamed inline) and rendered from a blob: URL. Blob
// URLs count as same-origin to the page that made them, which is what
// lets the Print button below drive the iframe's own print dialog -
// contentWindow.print() would throw on a cross-origin Cloudinary frame.
// #toolbar=0 hides the built-in PDF toolbar (Chrome/Edge) so the viewer's
// own download button isn't sitting on top of the document.
//
// Worth being clear about the limit: this removes the download
// affordance, not the ability. Any browser that can display a PDF can
// save it - the print dialog alone offers "Save as PDF". Treat it as the
// product decision it is ("we don't offer downloads"), not as protection
// of the customer's file.
export default function DocumentViewer({ order, index, label, onClose }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const frameRef = useRef(null);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, onClose);

  useEffect(() => {
    let revokeUrl = "";
    let cancelled = false;
    setLoading(true); setError(""); setRequestError(null); setBlobUrl("");

    (async () => {
      try {
        const { data } = await api.get(`/orders/${order._id}/documents/${index}/view`, {
          responseType: "blob",
        });
        if (cancelled) return;
        revokeUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        setBlobUrl(revokeUrl);
      } catch (failure) {
        if (!cancelled) { setError("Could not open this document. Try again in a moment."); setRequestError(failure); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Frees the file from memory as soon as the viewer closes, rather
      // than holding every document opened this session until reload.
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [order._id, index, revision]);

  const handlePrint = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/60 flex flex-col p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} - viewer`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-panel flex flex-col flex-1 min-h-0 max-w-5xl w-full mx-auto overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <p className="font-heading font-bold text-text-primary truncate">{label}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!blobUrl}
              className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
            >
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-background-soft">
          {loading && (
            <p className="p-8 text-center text-sm text-text-secondary">Loading document...</p>
          )}
          {error && <div className="public-content"><MascotRecovery compact headingLevel={2} error={requestError} title={requestError?.response?.status === 410 ? "This document access has ended." : undefined} message={requestError?.response?.status === 410 ? "The document is no longer available. Close this viewer to return to the order." : undefined} onRetry={requestError?.response?.status === 410 ? onClose : () => setRevision(value => value + 1)} primaryLabel={requestError?.response?.status === 410 ? "Return to order" : "Try again"} /></div>}
          {blobUrl && (
            <iframe
              ref={frameRef}
              src={`${blobUrl}#toolbar=0`}
              title={label}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
