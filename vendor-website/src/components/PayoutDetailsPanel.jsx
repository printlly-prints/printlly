import { useState } from "react";
import Panel, { PanelHeader } from "./dashboard/Panel";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { IFSC_REGEX } from "../utils/payout";

// Where a vendor's earnings get sent. Lives on the profile page, beside
// KYC, because it is the same kind of thing: account detail a vendor
// fills in once and rarely touches, not a day-to-day control.
//
// These details are read by a HUMAN - an admin makes the UPI or bank
// transfer by hand, outside this platform. Nothing here talks to a
// payment gateway, and saving this form does not cause anyone to be paid.
//
// The whole form is optional and partial: a vendor can give a UPI id and
// nothing else, or fill the bank block and add UPI later. PATCH
// /shops/me/payout accepts any subset, and an empty string clears a
// field - which is how a vendor switching from bank to UPI removes the
// stale account.
export default function PayoutDetailsPanel({ id }) {
  const { shop, refreshShop } = useAuth();
  const saved = shop?.payout || {};

  const [form, setForm] = useState({
    account_holder_name: saved.account_holder_name || "",
    account_number: saved.account_number || "",
    ifsc_code: saved.ifsc_code || "",
    upi_id: saved.upi_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSuccess("");
    setError("");
  };

  // Only what actually differs from what is stored. Sending the whole
  // form every time would make the backend's PayoutHistory log a change
  // on every save, and that log exists so an admin can notice a bank
  // account changing shortly before a large settlement - a row per save
  // would drown the signal it is there to give.
  const changedFields = Object.keys(form).filter(
    (key) => form[key].trim() !== (saved[key] || "")
  );
  const dirty = changedFields.length > 0;

  // Matches the backend's own rule, so a typo is caught before the round
  // trip rather than after it.
  const ifscInvalid = form.ifsc_code.trim() !== "" && !IFSC_REGEX.test(form.ifsc_code.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (saving || !dirty) return;
    if (ifscInvalid) {
      setError("Check the IFSC code — it should look like HDFC0001234.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = {};
      for (const key of changedFields) body[key] = form[key].trim();
      await api.patch("/shops/me/payout", body);
      await refreshShop();
      setSuccess("Payout details saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your payout details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    // scroll-mt so linking to #payout from the Earnings banner doesn't
    // land the heading underneath the sticky mobile top bar.
    <Panel as="form" id={id} onSubmit={submit} className="p-5 flex flex-col gap-4 scroll-mt-24">
      <PanelHeader
        title="Payout details"
        subtitle="Where we send what you've earned."
      />

      {/* Stated plainly and near the top, because a wrong digit here
          means money going to the wrong account - and unlike a wrong
          price, nothing downstream will catch it. */}
      <p className="text-sm text-busy-text bg-busy-bg rounded-card px-3 py-2.5">
        This is where we'll send your earnings — double-check these details.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Account holder name"
          hint="Exactly as it appears on your bank account"
          value={form.account_holder_name}
          onChange={set("account_holder_name")}
          autoComplete="off"
        />
        <Field
          label="Account number"
          value={form.account_number}
          onChange={set("account_number")}
          inputMode="numeric"
          autoComplete="off"
          className="tabular-nums"
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="payout-ifsc" className="text-sm font-medium text-text-primary">
            IFSC code
          </label>
          <input
            id="payout-ifsc"
            type="text"
            value={form.ifsc_code}
            onChange={set("ifsc_code")}
            // Upper-cased as the vendor types, matching how the backend
            // stores it - so the field never shows one casing and the
            // saved value another.
            onBlur={() =>
              setForm((f) => ({ ...f, ifsc_code: f.ifsc_code.trim().toUpperCase() }))
            }
            placeholder="HDFC0001234"
            maxLength={11}
            autoComplete="off"
            aria-invalid={ifscInvalid}
            aria-describedby="payout-ifsc-hint"
            className={`h-10 px-3 rounded-control border bg-surface text-sm text-text-primary uppercase tabular-nums placeholder:normal-case placeholder:text-text-muted focus:outline-none focus:ring-2 ${
              ifscInvalid
                ? "border-error focus:border-error focus:ring-error/30"
                : "border-border focus:border-primary focus:ring-primary/20"
            }`}
          />
          <p
            id="payout-ifsc-hint"
            className={`text-xs ${ifscInvalid ? "text-error-text" : "text-text-secondary"}`}
          >
            {ifscInvalid
              ? "11 characters: 4 letters, then 0, then 6 letters or digits."
              : "11 characters, e.g. HDFC0001234."}
          </p>
        </div>
        <Field
          label="UPI ID"
          hint="Optional — we can pay by UPI instead"
          value={form.upi_id}
          onChange={set("upi_id")}
          placeholder="yourname@bank"
          autoComplete="off"
        />
      </div>

      {error && <p className="text-sm text-error-text">{error}</p>}
      {success && <p className="text-sm text-success-text">{success}</p>}

      <div className="flex items-center justify-end gap-3">
        {dirty && !error && !success && (
          <span className="text-xs text-text-secondary">Unsaved changes</span>
        )}
        <button
          type="submit"
          disabled={saving || !dirty}
          className="px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {saving ? "Saving..." : dirty ? "Save payout details" : "Saved"}
        </button>
      </div>
    </Panel>
  );
}

function Field({ label, hint, className = "", ...props }) {
  const id = `payout-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={`h-10 px-3 rounded-control border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
        {...props}
      />
      {hint && <p className="text-xs text-text-secondary">{hint}</p>}
    </div>
  );
}
