import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import { Badge, ErrorNote, Loading, PageHeader, TableShell, Td, Tr, formatDate } from "../components/ui";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

// The panel's main feature: the queue of shops waiting on a verification
// decision, and the review view that decision is made from.
//
// Defaults to the pending tab because that is the only tab with work in
// it - the others exist to look up what was already decided.
export default function VendorVerification() {
  const [tab, setTab] = useState("pending");
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = tab === "all" ? "" : `?verification_status=${tab}`;
      const { data } = await api.get(`/admin/shops${query}`);
      setShops(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load shops.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Called after a decision lands. Refreshes this list and tells the
  // layout to re-read its pending badge, so the sidebar count drops in
  // step with the row leaving the pending tab.
  const handleDecided = (shopName, status) => {
    setReviewingId(null);
    setFlash(`${shopName} ${status === "approved" ? "approved" : "rejected"}.`);
    load();
    window.dispatchEvent(new Event("admin:shops-changed"));
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Vendor Verification"
        description="Review a shop's details and KYC document, then approve or reject it."
      />

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setFlash("");
            }}
            className={`px-3 py-1.5 rounded-control text-sm font-medium ${
              tab === t.key
                ? "bg-primary text-white"
                : "bg-surface border border-border text-text-secondary hover:bg-background-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {flash && (
        <p className="text-sm text-success-text bg-success-bg rounded-control p-3 mb-4">{flash}</p>
      )}
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <Loading label="Loading shops..." />
      ) : (
        <TableShell
          headers={["Shop", "Owner", "Submitted", "Status", ""]}
          empty={
            shops.length === 0
              ? tab === "pending"
                ? "Nothing waiting for review."
                : `No ${tab === "all" ? "" : tab} shops.`
              : null
          }
        >
          {shops.map((shop) => (
            <Tr key={shop._id}>
              <Td>
                <div className="font-medium text-text-primary">{shop.shop_name}</div>
                <div className="text-xs text-text-muted">{shop.address}</div>
              </Td>
              <Td>
                <div className="text-text-primary">{shop.owner_id?.name || "—"}</div>
                <div className="text-xs text-text-muted">{shop.owner_id?.email || "—"}</div>
              </Td>
              <Td className="whitespace-nowrap text-text-secondary">{formatDate(shop.createdAt)}</Td>
              <Td>
                <Badge value={shop.verification_status} />
                {shop.verification_status === "rejected" && shop.rejection_reason && (
                  <div className="text-xs text-text-muted mt-1 max-w-[220px]">{shop.rejection_reason}</div>
                )}
              </Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => setReviewingId(shop._id)}
                  className="px-3 py-1.5 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep whitespace-nowrap"
                >
                  Review
                </button>
              </Td>
            </Tr>
          ))}
        </TableShell>
      )}

      {reviewingId && (
        <ReviewModal
          shopId={reviewingId}
          onClose={() => setReviewingId(null)}
          onDecided={handleDecided}
        />
      )}
    </AdminLayout>
  );
}

// The review view. Fetches GET /admin/shops/:id fresh on open, which is
// what mints the signed KYC URL - that link expires in ~5 minutes, so it
// deliberately is NOT carried over from the list payload (the list never
// contains one) or cached between openings.
function ReviewModal({ shopId, onClose, onDecided }) {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState(null); // null | "approve" | "reject"
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/admin/shops/${shopId}`);
        if (!cancelled) setShop(data);
      } catch (err) {
        if (!cancelled) setLoadError(err.response?.data?.message || "Could not load this shop.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const submit = async (status) => {
    if (status === "rejected" && !reason.trim()) {
      setSubmitError("Give a reason - the vendor sees this and needs to know what to fix.");
      return;
    }
    setSubmitError("");
    setSubmitting(true);
    try {
      await api.patch(`/admin/shops/${shopId}/verify`, {
        status,
        ...(status === "rejected" ? { rejection_reason: reason.trim() } : {}),
      });
      onDecided(shop?.shop_name || "Shop", status);
    } catch (err) {
      setSubmitError(err.response?.data?.message || "Could not save that decision. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const kyc = shop?.kyc || {};
  const doc = shop?.kyc_document || {};
  const isImage = doc.resource_type === "image";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-surface-deep/75 p-4 overflow-y-auto">
      <div className="bg-surface rounded-modal border border-border shadow-modal w-full max-w-2xl my-8">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-text-primary">
              {loading ? "Loading..." : shop?.shop_name}
            </h3>
            {shop && <p className="text-sm text-text-secondary mt-0.5">{shop.address}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-control text-text-secondary hover:bg-background-soft"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <Loading label="Loading shop details..." />
          ) : loadError ? (
            <ErrorNote>{loadError}</ErrorNote>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2">
                <PhotoBlock label="Shop photo" url={shop.shop_photo_url} />
                <PhotoBlock label="Owner photo" url={shop.owner_photo_url} />
              </section>

              <section>
                <h4 className="text-sm font-semibold text-text-primary mb-2">Shop details</h4>
                <dl className="text-sm bg-background-soft rounded-control p-3 space-y-1.5">
                  <Row label="Owner" value={shop.owner_id?.name} />
                  <Row label="Email" value={shop.owner_id?.email} />
                  <Row label="Owner phone" value={shop.owner_id?.phone} />
                  <Row label="Shop contact" value={shop.contact} />
                  <Row label="Registered" value={formatDate(shop.createdAt)} />
                  <Row label="Current status" value={shop.verification_status} />
                </dl>
              </section>

              <section>
                <h4 className="text-sm font-semibold text-text-primary mb-2">KYC</h4>
                <dl className="text-sm bg-background-soft rounded-control p-3 space-y-1.5">
                  <Row label="ID proof type" value={kyc.id_proof_type} />
                  {/* GST is optional for a vendor - say so plainly rather
                      than leaving a bare dash the reviewer has to guess at. */}
                  <Row label="GST number" value={kyc.gst_number || "Not provided"} />
                </dl>

                <div className="mt-3">
                  {!doc.signed_url ? (
                    <p className="text-sm text-status-pending-text bg-status-pending-bg rounded-control p-3">
                      This vendor hasn&rsquo;t submitted a KYC document yet. Rejecting with a reason will
                      prompt them to upload one.
                    </p>
                  ) : isImage ? (
                    <div>
                      <img
                        src={doc.signed_url}
                        alt="KYC ID proof"
                        className="max-h-80 w-auto rounded-control border border-border"
                      />
                      <p className="text-xs text-text-muted mt-1.5">
                        This link expires about {Math.round((doc.expires_in_seconds || 300) / 60)} minutes
                        after opening this view. Reopen the review to get a fresh one.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <a
                        href={doc.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 rounded-control border border-border text-sm font-medium text-primary-bright hover:bg-background-soft"
                      >
                        View document (PDF)
                      </a>
                      <p className="text-xs text-text-muted mt-1.5">
                        This link expires about {Math.round((doc.expires_in_seconds || 300) / 60)} minutes
                        after opening this view. Reopen the review to get a fresh one.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {submitError && (
                <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{submitError}</p>
              )}

              {mode === "reject" ? (
                <section className="border-t border-border pt-4">
                  <label htmlFor="reason" className="block text-sm font-medium text-text-primary mb-1">
                    Reason for rejection
                  </label>
                  <p className="text-xs text-text-muted mb-2">
                    Sent to the vendor as a notification, so write what they need to fix.
                  </p>
                  <textarea
                    id="reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. The ID proof photo is too blurry to read."
                    className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  />
                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMode(null);
                        setSubmitError("");
                      }}
                      disabled={submitting}
                      className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => submit("rejected")}
                      disabled={submitting || !reason.trim()}
                      className="px-4 py-2 rounded-control bg-error text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {submitting ? "Rejecting..." : "Confirm rejection"}
                    </button>
                  </div>
                </section>
              ) : (
                <section className="border-t border-border pt-4 flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("reject")}
                    disabled={submitting}
                    className="px-4 py-2 rounded-control border border-error text-error-text text-sm font-medium hover:bg-error-bg disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => submit("approved")}
                    disabled={submitting}
                    className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
                  >
                    {submitting ? "Approving..." : "Approve"}
                  </button>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoBlock({ label, url }) {
  return (
    <div>
      <p className="text-sm font-semibold text-text-primary mb-2">{label}</p>
      {url ? (
        <img src={url} alt={label} className="w-full h-40 object-cover rounded-control border border-border" />
      ) : (
        <div className="w-full h-40 rounded-control border border-border bg-background-soft flex items-center justify-center text-sm text-text-muted">
          Not uploaded
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex gap-3 justify-between">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-text-primary text-right">{value || "—"}</dd>
    </div>
  );
}
