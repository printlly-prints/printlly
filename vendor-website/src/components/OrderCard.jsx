import { useState } from "react";
import StatusBadge from "./StatusBadge";
import DocumentViewer from "./DocumentViewer";

// Print settings are PER DOCUMENT: one order can hold a 40-page B&W
// handout and a laminated colour poster, and the shop has to print each
// one differently. Everything below exists so a vendor can read exactly
// what to do per file without opening anything.

// The settings a vendor can get WRONG expensively - colour mode and copy
// count - are pulled out as chips rather than buried in a run-on line.
// Printing 3 copies in colour when the customer asked for 1 in B&W is the
// mistake this layout is trying to prevent.
function documentChips(doc) {
  const chips = [
    {
      key: "color",
      label: doc.color_mode === "bw" ? "B&W" : "Colour",
      // Colour is the one that costs real money to get wrong, so it is
      // the one that is visually loud.
      className:
        doc.color_mode === "bw"
          ? "bg-background-tint text-text-secondary"
          : "bg-primary-wash text-primary-deep font-semibold",
    },
    {
      key: "copies",
      label: `${doc.copies} cop${doc.copies === 1 ? "y" : "ies"}`,
      className:
        doc.copies > 1
          ? "bg-primary-wash text-primary-deep font-semibold"
          : "bg-background-tint text-text-secondary",
    },
    {
      key: "paper",
      label: doc.paper_size || "A4",
      className:
        doc.paper_size === "A3"
          ? "bg-primary-wash text-primary-deep font-semibold"
          : "bg-background-tint text-text-secondary",
    },
    {
      key: "sides",
      label: doc.sides === "double" ? "Double-sided" : "Single-sided",
      className:
        doc.sides === "double"
          ? "bg-primary-wash text-primary-deep font-semibold"
          : "bg-background-tint text-text-secondary",
    },
  ];

  // Finishing services are manual work after printing, so they are never
  // styled as a quiet default - if one is listed, it needs doing. These
  // are the names and prices SNAPSHOTTED when the order was placed, so
  // they read correctly even if the shop has since renamed or removed the
  // service (see models/Order.js).
  for (const service of doc.services || []) {
    chips.push({
      key: service.service_id || service.name,
      label: service.name,
      className: "bg-success-bg text-success-text font-semibold",
    });
  }

  return chips;
}

// Renders one order and the action(s) available for its current status.
// The parent (OrdersDashboard) owns the actual API calls and passes them
// down as callbacks so this component stays purely presentational.
// Used as the body of OrderDetailPanel now that the queue itself is a
// table - the card is the DETAIL of one order rather than the list item.
// autoOtp / initialViewingIndex let the row that opened it land straight
// on what was asked for ("Verify OTP" / "View & print") instead of making
// the vendor click the same thing twice.
export default function OrderCard({
  order,
  onAccept,
  onReady,
  onComplete,
  actionLoading,
  autoOtp = false,
  initialViewingIndex = null,
}) {
  const [showOtpInput, setShowOtpInput] = useState(autoOtp);
  // Which document (by index) is open in the viewer; null = none.
  const [viewingIndex, setViewingIndex] = useState(initialViewingIndex);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [otp, setOtp] = useState("");

  const customerName = order.customer_id?.name || "Unknown customer";
  const isBusy = actionLoading === order._id;
  const isExpired = order.status === "expired";
  // Orders placed before per-document pricing existed have no
  // documents[].pricing to show, so the breakdown is offered only when
  // there is something real behind it.
  const hasPerDocumentPricing =
    !isExpired && (order.documents || []).some((doc) => doc.pricing?.document_total !== undefined);

  const handleConfirmOtp = () => {
    if (otp.trim().length !== 6) return;
    onComplete(order._id, otp.trim());
  };

  return (
    <div className="flex flex-col gap-4">
      {viewingIndex !== null && (
        <DocumentViewer
          order={order}
          index={viewingIndex}
          label={`Document ${viewingIndex + 1}`}
          onClose={() => setViewingIndex(null)}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading font-bold text-text-primary truncate">{customerName}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Placed {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>



      {isExpired ? (
        // The cron that expires abandoned orders also deletes their
        // Cloudinary files, so file_url would 404 - no document list or
        // links shown here at all rather than pointing at dead files.
        <div className="text-sm bg-status-done-bg rounded-card p-3 text-status-done-text">
          Expired — customer did not complete this order. Documents were automatically deleted.
        </div>
      ) : (
        // One order can bundle several documents. original_name is
        // snapshotted at order creation (Uploads are deleted on
        // completion, so it cannot be looked up later); orders placed
        // before that field existed fall back to a positional label.
        <div className="text-sm">
          <p className="text-text-secondary font-medium mb-1.5">
            Documents ({order.documents?.length ?? 0})
          </p>
          <ul className="flex flex-col gap-1.5">
            {(order.documents || []).map((doc, index) => (
              <li
                key={doc.upload_id || index}
                className="bg-background-soft border border-border rounded-card px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-text-primary min-w-0">
                    {doc.original_name || `Document ${index + 1}`}{" "}
                    <span className="text-text-secondary">
                      · {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  {/* Opens the in-dashboard viewer rather than linking to
                      the file: a vendor prints the customer's document,
                      they don't take a copy of it. See DocumentViewer.jsx. */}
                  <button
                    type="button"
                    onClick={() => setViewingIndex(index)}
                    className="text-primary-bright font-medium hover:underline whitespace-nowrap rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    View &amp; print
                  </button>
                </div>
                {/* This document's own settings - what the shop actually
                    prints from. Never one shared line for the order. */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {documentChips(doc).map((chip) => (
                    <span
                      key={chip.key}
                      className={`text-xs px-2 py-0.5 rounded-full ${chip.className}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pricing breakdown - every figure is computed and stored
          server-side; nothing here is recalculated. Add-on charges are
          omitted when zero rather than cluttering the card with ₹0 rows.
          The order-level lines are the SUMS of the per-document ones, so
          the collapsible section below always adds up to this total. */}
      <div className="text-sm bg-background-soft border border-border rounded-card p-3 flex flex-col gap-1">
        {/* Collapsed by default: a vendor checking what they owe wants the
            total, and only occasionally which file drove it. Hidden behind
            a toggle rather than dropped, since with per-document settings
            "why is this order ₹300" is a real question. */}
        {hasPerDocumentPricing && (
          <>
            <button
              type="button"
              onClick={() => setShowCostBreakdown((v) => !v)}
              aria-expanded={showCostBreakdown}
              className="flex justify-between items-center text-text-secondary hover:text-text-primary rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="font-medium">
                Cost per document {showCostBreakdown ? "▾" : "▸"}
              </span>
            </button>

            {showCostBreakdown && (
              <div className="flex flex-col gap-1.5 mt-1 mb-2 pl-1 border-l-2 border-border">
                {(order.documents || []).map((doc, index) => (
                  <div key={doc.upload_id || index} className="pl-2">
                    <div className="flex justify-between text-text-primary">
                      <span>
                        Document {index + 1}{" "}
                        <span className="text-text-muted text-xs">
                          ({doc.color_mode === "bw" ? "B&W" : "Colour"}
                          {doc.copies > 1 ? ` ×${doc.copies}` : ""})
                        </span>
                      </span>
                      <span className="tabular-nums">₹{doc.pricing?.document_total ?? 0}</span>
                    </div>
                    {/* The components are only worth showing when they are
                        non-zero - most documents are just printing. */}
                    <div className="text-xs text-text-muted flex flex-wrap gap-x-3">
                      <span>Printing ₹{doc.pricing?.base ?? 0}</span>
                      {doc.pricing?.paper_charge > 0 && <span>Paper ₹{doc.pricing.paper_charge}</span>}
                      {doc.pricing?.sides_charge > 0 && (
                        <span>Double-sided ₹{doc.pricing.sides_charge}</span>
                      )}
                      {doc.pricing?.services_charge > 0 && (
                        <span>Services ₹{doc.pricing.services_charge}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-between text-text-secondary">
          <span>Subtotal</span>
          <span className="tabular-nums">₹{order.base_subtotal ?? 0}</span>
        </div>
        {order.paper_size_charge > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Paper size</span>
            <span className="tabular-nums">₹{order.paper_size_charge}</span>
          </div>
        )}
        {order.sides_charge > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Double-sided</span>
            <span className="tabular-nums">₹{order.sides_charge}</span>
          </div>
        )}
        {order.services_charge > 0 && (
          <div className="flex justify-between text-text-secondary">
            <span>Add-on services</span>
            <span className="tabular-nums">₹{order.services_charge}</span>
          </div>
        )}
        <div className="flex justify-between text-text-secondary">
          <span>Platform fee</span>
          <span className="tabular-nums">₹{order.platform_fee ?? 0}</span>
        </div>
        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-border">
          <span className="font-heading font-bold text-text-primary">Total</span>
          <span className="font-heading text-lg font-extrabold text-primary-bright tabular-nums">
            ₹{order.total_amount ?? 0}
          </span>
        </div>
      </div>

      {order.instructions && (
        <p className="text-sm text-text-secondary bg-primary-wash rounded-card p-3">
          <span className="font-medium text-primary-deep">Instructions: </span>
          {order.instructions}
        </p>
      )}

      {/* Action area — only one action is ever relevant at a time, based on status */}
      <div className="pt-1">
        {/* One primary action per card - whichever step this order is at. */}
        {order.status === "pending" && (
          <button
            onClick={() => onAccept(order._id)}
            disabled={isBusy}
            className="w-full sm:w-auto px-6 min-h-11 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 disabled:hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {isBusy ? "Accepting..." : "Accept"}
          </button>
        )}

        {order.status === "accepted" && (
          <button
            onClick={() => onReady(order._id)}
            disabled={isBusy}
            className="w-full sm:w-auto px-6 min-h-12 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {isBusy ? "Updating..." : "Mark Ready"}
          </button>
        )}

        {order.status === "ready_for_pickup" && !showOtpInput && (
          <button
            onClick={() => setShowOtpInput(true)}
            className="w-full sm:w-auto px-6 min-h-11 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Verify pickup code
          </button>
        )}

        {order.status === "ready_for_pickup" && showOtpInput && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`otp-${order._id}`} className="sr-only">
              Pickup OTP
            </label>
            <input
              id={`otp-${order._id}`}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit OTP"
              className="w-36 px-3.5 min-h-11 border border-border rounded-control text-sm tracking-[0.25em] text-text-primary bg-surface placeholder:text-text-muted placeholder:tracking-normal focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={handleConfirmOtp}
              disabled={isBusy || otp.trim().length !== 6}
              className="px-6 min-h-11 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 disabled:hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {isBusy ? "Verifying..." : "Confirm"}
            </button>
            <button
              onClick={() => {
                setShowOtpInput(false);
                setOtp("");
              }}
              className="px-3 min-h-11 rounded-control text-sm text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
