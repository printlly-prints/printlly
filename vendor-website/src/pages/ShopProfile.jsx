import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import VerificationBanner from "../components/VerificationBanner";
import ShopLocationForm from "../components/ShopLocationForm";
import Panel, { PanelHeader } from "../components/dashboard/Panel";
import PayoutDetailsPanel from "../components/PayoutDetailsPanel";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const ID_PROOF_OPTIONS = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "pan", label: "PAN" },
  { value: "other", label: "Other" },
];

// The four states verification_status can hold, as a badge. Drawn from
// the same status tokens the order badges use, so "verified" here and
// "ready for pickup" there read as the same kind of signal.
const VERIFICATION_BADGE = {
  pending: { label: "Pending", className: "bg-status-pending-bg text-status-pending-text" },
  approved: { label: "Verified", className: "bg-success-bg text-success-text" },
  rejected: { label: "Rejected", className: "bg-error-bg text-error-text" },
};

// Follow-up to shop registration: owner/shop photos (POST /shops/me/photos),
// location (PATCH /shops/me/location, see ShopLocationForm) and KYC
// (POST /shops/me/kyc). Reached right after registering a shop for
// the first time, and reachable any time after via the sidebar's "Profile"
// item or the dashboard's VerificationBanner ("Resubmit KYC") - none of
// this blocks dashboard access (see ProtectedRoute, which only requires a
// shop to exist, not that it's approved).
export default function ShopProfile() {
  const { shop, refreshShop } = useAuth();
  const navigate = useNavigate();
  const { hash } = useLocation();

  // React Router does not scroll to a #hash by itself, and /earnings
  // links here as /shop-profile#payout when payout details are missing.
  // Without this the vendor lands at the top of a long page with no
  // indication of which section they were sent to.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    // rAF so the scroll happens after this render has painted - the
    // element's final position depends on panels above it that size
    // themselves from shop data.
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  // --- Photos --------------------------------------------------------------
  const [ownerPhotoFile, setOwnerPhotoFile] = useState(null);
  const [ownerPreview, setOwnerPreview] = useState(null);
  const [shopPhotoFile, setShopPhotoFile] = useState(null);
  const [shopPreview, setShopPreview] = useState(null);
  const [photosError, setPhotosError] = useState("");
  const [photosSuccess, setPhotosSuccess] = useState("");
  const [photosLoading, setPhotosLoading] = useState(false);

  // Object URLs are only for the picked-but-not-yet-uploaded preview - they
  // must be revoked or they leak memory for the life of the tab.
  useEffect(() => {
    return () => {
      if (ownerPreview) URL.revokeObjectURL(ownerPreview);
    };
  }, [ownerPreview]);
  useEffect(() => {
    return () => {
      if (shopPreview) URL.revokeObjectURL(shopPreview);
    };
  }, [shopPreview]);

  const pickOwnerPhoto = (file) => {
    if (!file) return;
    setOwnerPhotoFile(file);
    setOwnerPreview(URL.createObjectURL(file));
    setPhotosSuccess("");
  };

  const pickShopPhoto = (file) => {
    if (!file) return;
    setShopPhotoFile(file);
    setShopPreview(URL.createObjectURL(file));
    setPhotosSuccess("");
  };

  // Either field alone is fine - the backend accepts one or both, so a
  // vendor can update just one photo later without resending the other.
  const handlePhotosSubmit = async (e) => {
    e.preventDefault();
    if (!ownerPhotoFile && !shopPhotoFile) {
      setPhotosError("Choose at least one photo to upload.");
      return;
    }
    setPhotosError("");
    setPhotosSuccess("");
    setPhotosLoading(true);
    try {
      const form = new FormData();
      if (ownerPhotoFile) form.append("owner_photo", ownerPhotoFile);
      if (shopPhotoFile) form.append("shop_photo", shopPhotoFile);
      await api.post("/shops/me/photos", form);
      await refreshShop();
      setPhotosSuccess("Photos uploaded.");
      setOwnerPhotoFile(null);
      setShopPhotoFile(null);
      // Drop the local previews too, not just the File handles. Each
      // preview is an object URL pinning the full-resolution image in
      // memory, and until now they were only released on unmount or when
      // a different file was picked - so a vendor who uploaded and stayed
      // on this page kept both originals resident for nothing. refreshShop()
      // above has already replaced them with the saved (and now
      // server-side resized) URLs, and PhotoDropzone falls back to
      // those the moment previewUrl is null, so this changes nothing
      // visible.
      setOwnerPreview(null);
      setShopPreview(null);
    } catch (err) {
      setPhotosError(err.response?.data?.message || "Could not upload photos. Please try again.");
    } finally {
      setPhotosLoading(false);
    }
  };

  const hasPendingPhoto = Boolean(ownerPhotoFile || shopPhotoFile);

  // --- Danger zone: deactivation --------------------------------------
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  const [deactivateError, setDeactivateError] = useState("");

  // Once this succeeds, refreshShop() updates AuthContext's shop with
  // is_active: false, which is what makes DeactivatedBanner appear across
  // every dashboard page from here on (see that component) - nothing else
  // needs to change on this page itself.
  const handleDeactivate = async () => {
    setDeactivateError("");
    setDeactivateLoading(true);
    try {
      await api.patch("/shops/me/deactivate");
      await refreshShop();
      setShowDeactivateConfirm(false);
    } catch (err) {
      setDeactivateError(err.response?.data?.message || "Could not deactivate your shop. Please try again.");
    } finally {
      setDeactivateLoading(false);
    }
  };

  // --- KYC -------------------------------------------------------------
  const [idProofType, setIdProofType] = useState("aadhaar");
  const [idProofFile, setIdProofFile] = useState(null);
  const [gstNumber, setGstNumber] = useState("");
  const [kycError, setKycError] = useState("");
  const [kycSuccess, setKycSuccess] = useState("");
  const [kycLoading, setKycLoading] = useState(false);

  // Mirrors kycLockReason in shopController.js exactly. Note "pending"
  // alone doesn't lock anything: a new shop is pending before it has
  // submitted anything, and that first submission must be offered. GET
  // /shops/me strips the file reference but keeps id_proof_type, so that
  // is what tells us a document was actually submitted.
  const kycSubmitted = Boolean(shop?.kyc?.id_proof_type);
  const kycLocked =
    shop?.verification_status === "approved" || (shop?.verification_status === "pending" && kycSubmitted);

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    if (kycLocked) return;
    if (!idProofFile) {
      setKycError("Choose your ID proof document.");
      return;
    }
    setKycError("");
    setKycSuccess("");
    setKycLoading(true);
    try {
      const form = new FormData();
      form.append("id_proof_type", idProofType);
      form.append("id_proof", idProofFile);
      if (gstNumber.trim()) form.append("gst_number", gstNumber.trim());
      await api.post("/shops/me/kyc", form);
      await refreshShop();
      setKycSuccess("KYC submitted for review.");
      setIdProofFile(null);
      // Not resetting idProofType/gstNumber - if this was a resubmission
      // after a rejection, the vendor most likely picked the same type and
      // GST number and shouldn't have to retype them.
    } catch (err) {
      setKycError(err.response?.data?.message || "Could not submit KYC. Please try again.");
    } finally {
      setKycLoading(false);
    }
  };

  // ProtectedRoute (requireShop) already guards this page - shop is only
  // briefly null while that redirect resolves.
  if (!shop) return null;

  const badge = VERIFICATION_BADGE[shop.verification_status] || VERIFICATION_BADGE.pending;
  // "Under review" is not a stored status - it is pending WITH a document
  // already submitted, which is a genuinely different thing to tell a
  // vendor than "pending, we're waiting on you".
  const badgeLabel =
    shop.verification_status === "pending" && kycSubmitted ? "Under review" : badge.label;

  return (
    <DashboardLayout>
      {/* max-w-7xl, the same container Dashboard, Orders and Pricing use,
          so this page's left edge lines up with theirs rather than
          sitting as a narrow column in the middle of the content area. */}
      <div className="max-w-7xl mx-auto flex flex-col gap-4 motion-safe:animate-[printlly-rise_300ms_ease-out]">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-heading text-2xl font-bold text-text-primary">Shop profile</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                {badgeLabel}
              </span>
            </div>
            <p className="text-sm text-text-secondary mt-1 max-w-2xl">
              Manage your shop photos, location and verification details. None of this blocks you from
              taking orders in the meantime — see your{" "}
              <Link to="/orders" className="text-primary-bright font-medium hover:text-primary-deep">
                orders
              </Link>
              .
            </p>
          </div>

          {/* One save action at the top, for the one section on this page
              that holds unsaved edits. Location and KYC each save through
              their own route and keep their own button - a single "Save
              changes" here would imply it submits all three. */}
          <button
            type="submit"
            form={PHOTOS_FORM_ID}
            disabled={photosLoading || !hasPendingPhoto}
            className="shrink-0 px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {photosLoading ? "Uploading..." : hasPendingPhoto ? "Save photos" : "No changes"}
          </button>
        </header>

        <VerificationBanner shop={shop} />

        {/* --- photos + shop information ---------------------------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Panel as="form" id={PHOTOS_FORM_ID} onSubmit={handlePhotosSubmit} className="p-5 flex flex-col gap-4">
            <PanelHeader
              title="Shop photos"
              subtitle="Add photos customers will see when browsing your shop. JPG or PNG, up to 5MB each."
            />

            {/* The shop photo is the cover: it is the image that appears
                on this shop's card in the customer app, so it gets the
                large area. There is one of these, not a gallery - the
                backend stores a single shop_photo_url. */}
            <PhotoDropzone
              inputId="shop_photo"
              label="Cover photo"
              hint="Shown on your shop's card in the app"
              aspect="aspect-[16/9]"
              currentUrl={shop.shop_photo_url}
              previewUrl={shopPreview}
              pendingFile={shopPhotoFile}
              onPick={pickShopPhoto}
              onClear={() => {
                setShopPhotoFile(null);
                setShopPreview(null);
              }}
            />

            <PhotoDropzone
              inputId="owner_photo"
              label="Owner photo"
              hint="Used for verification — never shown to customers"
              aspect="aspect-[4/3]"
              compact
              currentUrl={shop.owner_photo_url}
              previewUrl={ownerPreview}
              pendingFile={ownerPhotoFile}
              onPick={pickOwnerPhoto}
              onClear={() => {
                setOwnerPhotoFile(null);
                setOwnerPreview(null);
              }}
            />

            {photosError && (
              <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{photosError}</p>
            )}
            {photosSuccess && (
              <p className="text-sm text-success-text bg-success-bg rounded-control p-3 motion-safe:animate-[printlly-rise_220ms_ease-out]">
                {photosSuccess}
              </p>
            )}

            <div>
              <button
                type="submit"
                disabled={photosLoading || !hasPendingPhoto}
                className="px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {photosLoading ? "Uploading..." : "Save photos"}
              </button>
            </div>
          </Panel>

          {/* Shop information is READ-ONLY, and says so. There is no route
              that updates shop_name, address or contact after creation -
              createShop is the only place they are ever written (see
              controllers/shopController.js). Rendering them as editable
              inputs would produce a form whose Save button could only
              ever throw away what was typed. */}
          <Panel className="p-5 flex flex-col gap-4">
            <PanelHeader
              title="Shop information"
              subtitle="Your registered details. Update your map pin and address in Shop location below."
            />
            <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
              <DetailField label="Shop name" value={shop.shop_name} />
              <DetailField label="Phone" value={shop.contact} />
              <DetailField label="Address" value={shop.address} className="sm:col-span-2" />
              <DetailField
                label="Locality / landmark"
                value={shop.locality}
                empty="Not set — add it in Location below"
                className="sm:col-span-2"
              />
            </dl>
            <p className="text-xs text-text-muted">
              For shop name or contact changes, contact support.
            </p>
          </Panel>
        </div>

        {/* --- location + map ---------------------------------------- */}
        <ShopLocationForm />

        {/* --- hours ------------------------------------------------- */}
        <ShopHoursPanel shop={shop} />

        {/* --- KYC --------------------------------------------------- */}
        <Panel as="form" onSubmit={handleKycSubmit} className="p-5 flex flex-col gap-4">
          <PanelHeader
            title="Identity verification (KYC)"
            subtitle="Required before your shop can be approved. Kept private — never shown publicly or to customers."
            action={
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                {badgeLabel}
              </span>
            }
          />

          {shop.verification_status === "pending" && kycSubmitted && (
            <p className="text-sm text-status-pending-text bg-status-pending-bg rounded-control p-3">
              <span className="font-semibold">Under review.</span> Your documents are with our team. You
              can&rsquo;t submit again until there&rsquo;s a decision - if something was wrong, we&rsquo;ll
              tell you why and you can resubmit then.
            </p>
          )}
          {shop.verification_status === "approved" ? (
            <p className="text-sm text-success-text bg-success-bg rounded-control p-3 flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>
                <span className="font-semibold">Verified.</span> Nothing more to do here. Contact support
                if your documents need updating.
              </span>
            </p>
          ) : (
            <>
              {shop.verification_status === "rejected" && (
                <p className="text-sm text-error-text bg-error-bg rounded-control p-3">
                  <span className="font-semibold">Rejected.</span>{" "}
                  {shop.rejection_reason || "Please resubmit your documents."} Upload a new document below.
                </p>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="id_proof_type" className="block text-sm font-medium text-text-primary mb-1">
                    ID proof type
                  </label>
                  <select
                    id="id_proof_type"
                    value={idProofType}
                    onChange={(e) => setIdProofType(e.target.value)}
                    disabled={kycLocked}
                    className="w-full h-10 px-3 border border-border rounded-control text-sm bg-surface disabled:bg-background-soft disabled:text-text-muted focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  >
                    {ID_PROOF_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="gst_number" className="block text-sm font-medium text-text-primary mb-1">
                    GST number <span className="text-text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    id="gst_number"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    disabled={kycLocked}
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    className="w-full h-10 px-3 border border-border rounded-control text-sm disabled:bg-background-soft focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* A real upload area rather than a bare file input, but the
                  same underlying <input type="file"> - the label wraps it,
                  so clicking anywhere in the area opens the picker. */}
              <div>
                <span className="block text-sm font-medium text-text-primary mb-1">ID proof document</span>
                <label
                  htmlFor="id_proof"
                  className={`flex items-center gap-3 px-4 py-3 rounded-card border border-dashed transition-colors duration-200 ${
                    kycLocked
                      ? "border-border bg-background-soft cursor-not-allowed"
                      : "border-border bg-background-soft/60 hover:border-primary/40 hover:bg-primary-wash cursor-pointer"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full bg-primary-wash text-primary-bright grid place-items-center shrink-0"
                  >
                    <IconUpload />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-primary truncate">
                      {idProofFile ? idProofFile.name : kycSubmitted ? "Document on file" : "Choose a file"}
                    </span>
                    <span className="block text-xs text-text-muted">JPG, PNG or PDF, up to 5MB</span>
                  </span>
                  {idProofFile && (
                    <span className="shrink-0 text-xs font-semibold text-success-text">Ready to submit</span>
                  )}
                  <input
                    id="id_proof"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => setIdProofFile(e.target.files?.[0] || null)}
                    disabled={kycLocked}
                    className="sr-only"
                  />
                </label>
                {/* The stored document is never sent back to the browser
                    (GET /shops/me strips the file reference), so there is
                    nothing to preview here - only whether one is on file. */}
              </div>

              {kycError && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{kycError}</p>}
              {kycSuccess && (
                <p className="text-sm text-success-text bg-success-bg rounded-control p-3">{kycSuccess}</p>
              )}

              {!kycLocked && (
                <div>
                  <button
                    type="submit"
                    disabled={kycLoading}
                    className="px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {kycLoading
                      ? "Submitting..."
                      : shop.verification_status === "rejected"
                        ? "Resubmit KYC"
                        : "Submit KYC"}
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* Payout details, directly after KYC: both are account detail a
            vendor fills in once and rarely revisits, and both are the
            kind of thing that has to be right before money moves. The
            id is what /earnings links to when the details are missing. */}
        <PayoutDetailsPanel id="payout" />

        {/* Danger zone - deliberately styled apart from every panel above
            (a red-tinted border and ground, not the plain neutral border
            the others use) since this is a much bigger, far less frequent
            action than anything else on this page. Hidden entirely once
            the shop is already deactivated - DeactivatedBanner (shown
            across the whole dashboard, see DashboardLayout) and its
            "Reactivate my shop" button are what a vendor sees at that
            point instead, so there's nothing left for this section to do. */}
        {shop.is_active && (
          <div className="rounded-panel border border-error/30 bg-error-bg/40 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-error-text">Danger zone</h2>
              <p className="text-xs text-text-secondary mt-0.5 max-w-xl">
                Deactivate your shop from Paprout. This takes it off the platform entirely — separate
                from, and much bigger than, the Open/Closed toggle in the sidebar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDeactivateConfirm(true)}
              className="shrink-0 px-4 h-10 rounded-control border border-error text-error-text text-sm font-semibold hover:bg-error-bg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            >
              Deactivate shop
            </button>
          </div>
        )}

        <button
          onClick={() => navigate("/orders")}
          className="self-start text-sm font-medium text-primary-bright hover:text-primary-deep"
        >
          ← Back to orders
        </button>
      </div>

      {showDeactivateConfirm && (
        <DeactivateConfirmDialog
          onCancel={() => {
            setShowDeactivateConfirm(false);
            setDeactivateError("");
          }}
          onConfirm={handleDeactivate}
          loading={deactivateLoading}
          error={deactivateError}
        />
      )}
    </DashboardLayout>
  );
}

// The photos form's id, so the header button can submit it from outside.
const PHOTOS_FORM_ID = "shop-photos-form";

function DetailField({ label, value, empty = "Not set", className = "" }) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className={`text-sm mt-0.5 ${value ? "text-text-primary" : "text-text-muted italic"}`}>
        {value || empty}
      </dd>
    </div>
  );
}

// Business hours are ONE window applied to every day - the schema has a
// single open_time/close_time pair, not a per-day schedule (see
// models/Shop.js). So this lists the days against that one window rather
// than inventing seven independently-editable rows the backend could not
// store. Editing stays on the Pricing page, which already owns the
// PATCH /shops/me/status call, so there is only ever one editor for it.
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ShopHoursPanel({ shop }) {
  const hours = shop.business_hours;
  const enabled = !!hours?.enabled;

  return (
    <Panel className="p-5">
      <PanelHeader
        title="Shop hours"
        subtitle={
          enabled
            ? "The same hours apply every day. Outside them your shop shows as closed automatically."
            : "No automatic schedule — your shop follows the Open/Closed toggle in the sidebar."
        }
        className="mb-3"
        action={
          <Link
            to="/pricing"
            className="shrink-0 px-4 h-9 grid place-items-center rounded-control border border-border text-sm font-semibold text-text-primary hover:bg-background-soft transition-colors duration-200"
          >
            Edit hours
          </Link>
        }
      />
      {enabled ? (
        <ul className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 rounded-card border border-border overflow-hidden">
          {DAYS.map((day, i) => (
            <li
              key={day}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                i % 2 === 1 ? "bg-background-soft/50" : "bg-surface"
              }`}
            >
              <span className="text-text-secondary">{day}</span>
              <span className="text-text-primary tabular-nums font-medium">
                {hours.open_time} – {hours.close_time}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary px-3 py-2.5 rounded-card bg-background-soft/60 border border-dashed border-border">
          Set opening and closing times to have your shop open and close itself.
        </p>
      )}
    </Panel>
  );
}

// Confirmation for the Danger Zone's "Deactivate shop" button - a
// simple "Yes, deactivate" button rather than a type-the-shop-name
// prompt (the task explicitly allowed either, whichever's simpler to
// build). Still a real modal, not a native confirm(), so the explanation
// copy and any API error can be styled and read clearly.
function DeactivateConfirmDialog({ onCancel, onConfirm, loading, error }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-deep/75 p-4">
      <div className="bg-surface rounded-modal border border-border p-6 max-w-sm w-full shadow-modal">
        <h3 className="font-heading font-bold text-text-primary">Deactivate your shop?</h3>
        <p className="text-sm text-text-secondary mt-2">
          Your shop will stop appearing to customers and won&rsquo;t accept new orders. Any orders
          already placed will still need to be completed. You can reactivate later.
        </p>

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
            className="px-4 py-2 rounded-control bg-error text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
          >
            {loading ? "Deactivating..." : "Yes, deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A real image area rather than a 20px-square thumbnail beside a file
// input: these photos are what a customer judges the shop by, so they are
// shown at a size where a vendor can actually tell whether the picture is
// any good.
//
// Drop, click and keyboard all reach the same <input type="file">.
// "Replace" is offered because POST /shops/me/photos overwrites; there is
// no delete route, so there is no Remove button that could pretend to
// clear a saved photo - Cancel only discards a pick not yet uploaded.
function PhotoDropzone({
  inputId,
  label,
  hint,
  aspect,
  compact = false,
  currentUrl,
  previewUrl,
  pendingFile,
  onPick,
  onClear,
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const displayUrl = previewUrl || currentUrl;

  const takeFile = (file) => {
    if (file && /^image\/(jpeg|png)$/.test(file.type)) onPick(file);
  };

  return (
    <div className={compact ? "sm:max-w-xs" : ""}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {pendingFile && (
          <span className="text-xs font-semibold text-primary-bright">Not saved yet</span>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          takeFile(e.dataTransfer.files?.[0]);
        }}
        className={`group relative ${aspect} w-full rounded-card border border-dashed overflow-hidden transition-[border-color,background-color] duration-200 ${
          dragging ? "border-primary bg-primary-wash" : "border-border bg-background-soft/60"
        }`}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.02]"
          />
        ) : null}

        {/* The whole area is the control. A label wrapping the input keeps
            it keyboard-reachable and needs no click handler. */}
        <label
          htmlFor={inputId}
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-opacity duration-200 ${
            displayUrl
              ? "opacity-0 hover:opacity-100 focus-within:opacity-100 bg-surface-deep/45 text-white"
              : "text-text-secondary"
          }`}
        >
          <span
            aria-hidden="true"
            className={`w-10 h-10 rounded-full grid place-items-center ${
              displayUrl ? "bg-white/20" : "bg-primary-wash text-primary-bright"
            }`}
          >
            <IconUpload />
          </span>
          <span className="text-sm font-semibold">
            {displayUrl ? "Replace photo" : "Upload photo"}
          </span>
          <span className={`text-xs ${displayUrl ? "text-white/80" : "text-text-muted"}`}>
            Drag an image here, or click to browse
          </span>
        </label>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => takeFile(e.target.files?.[0])}
          className="sr-only"
        />
      </div>

      <div className="flex items-center justify-between gap-3 mt-1.5">
        <p className="text-xs text-text-muted">{hint}</p>
        {pendingFile && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-xs font-semibold text-text-secondary hover:text-error-text transition-colors duration-200"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <polyline points="7.5 8.5 12 4 16.5 8.5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
