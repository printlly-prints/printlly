import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import Panel, { PanelHeader } from "../components/dashboard/Panel";
import Switch from "../components/Switch";
import ServicesManager from "../components/ServicesManager";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";


// Everything here mirrors Shop.pricing's shape (models/Shop.js) except
// A4, which this page never edits - see the "Paper size" section below.
// Numbers are kept as strings in state so a field can be cleared/typed
// into freely; they're only converted with Number(...) for the live
// example and the PATCH body.
const EMPTY_PRICING = {
  rate_per_page_bw: "",
  rate_per_page_color: "",
  paper_size_rates: { A3: "" },
  sides_extra_rate: "",
};

// The rates form's id, so the header's Save button can submit it from
// outside the form element.
const PRICING_FORM_ID = "pricing-rates-form";

const EXAMPLE_PAGES = 10;
const EXAMPLE_COPIES = 1;

// Vendor-controlled pricing (GET/PATCH /shops/me/pricing) - every field a
// shop can charge for except platform_fee, which stays global and has no
// control here at all (see models/Shop.js's pricing schema comment - no
// vendor route can read or set it, so this page has nothing to show for
// it even if it wanted to).
export default function PricingPage() {
  const { shop, refreshShop } = useAuth();

  const [pricing, setPricing] = useState(EMPTY_PRICING);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  // business_hours lives on the Shop document itself (PATCH /shops/me/
  // status, not /pricing), and AuthContext's `shop` already has it - no
  // separate fetch needed. Initialized lazily since `shop` is already
  // loaded by the time this page can be reached (ProtectedRoute requires
  // one to exist).
  const [businessHours, setBusinessHours] = useState(() => ({
    enabled: !!shop?.business_hours?.enabled,
    open_time: shop?.business_hours?.open_time || "09:00",
    close_time: shop?.business_hours?.close_time || "21:00",
  }));
  const [hoursError, setHoursError] = useState("");
  const [hoursSuccess, setHoursSuccess] = useState("");
  const [hoursSaving, setHoursSaving] = useState(false);
  // A saved schedule is shown as a plain summary with a Change button,
  // not as a permanently-open form: an always-editable form gave a vendor
  // no way to tell what was actually stored from what they had merely
  // typed, and no confirmation that a save had stuck.
  const [editingHours, setEditingHours] = useState(!shop?.business_hours?.enabled);

  // Re-syncs the form whenever the stored schedule changes (a save
  // elsewhere, or `shop` arriving after this page first rendered) - the
  // useState initializers above only ever run once.
  useEffect(() => {
    setBusinessHours({
      enabled: !!shop?.business_hours?.enabled,
      open_time: shop?.business_hours?.open_time || "09:00",
      close_time: shop?.business_hours?.close_time || "21:00",
    });
  }, [shop?.business_hours?.enabled, shop?.business_hours?.open_time, shop?.business_hours?.close_time]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/shops/me/pricing");
        if (cancelled) return;
        setPricing({
          rate_per_page_bw: String(data.rate_per_page_bw ?? ""),
          rate_per_page_color: String(data.rate_per_page_color ?? ""),
          paper_size_rates: { A3: String(data.paper_size_rates?.A3 ?? "") },
          sides_extra_rate: String(data.sides_extra_rate ?? ""),
        });
      } catch (err) {
        if (!cancelled) setLoadError(err.response?.data?.message || "Could not load your pricing.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (field, value) => setPricing((p) => ({ ...p, [field]: value }));
  const setA3 = (value) => setPricing((p) => ({ ...p, paper_size_rates: { A3: value } }));

  // Mirrors PATCH /shops/me/pricing's own validation (updateMyPricing in
  // shopController.js) so a mistake is caught here rather than round-
  // tripping to the server first. A disabled service's rate is never
  // validated - it isn't charged, so whatever's left in that field
  // (typically 0, from the last time it was on) doesn't block saving.
  const validationError = useMemo(() => {
    if (pricing.rate_per_page_bw === "" || Number(pricing.rate_per_page_bw) < 0) {
      return "B&W rate must be 0 or more.";
    }
    if (pricing.rate_per_page_color === "" || Number(pricing.rate_per_page_color) < 0) {
      return "Colour rate must be 0 or more.";
    }
    if (pricing.paper_size_rates.A3 === "" || Number(pricing.paper_size_rates.A3) < 0) {
      return "A3 surcharge must be 0 or more.";
    }
    if (pricing.sides_extra_rate === "" || Number(pricing.sides_extra_rate) < 0) {
      return "Double-sided extra must be 0 or more.";
    }
    return "";
  }, [pricing]);

  // Same formula as computeSubtotal in utils/pricing.js, for A4 + single-
  // sided specifically - both add nothing (A4 is the ₹0 reference size,
  // single-sided carries no surcharge), so base_subtotal is the whole
  // story here. Deliberately NOT adding platform_fee - it's global, not
  // this shop's own rate, and this page has no way to know its value
  // anyway (see the file header comment).
  const exampleTotal = useMemo(() => {
    const bwRate = Number(pricing.rate_per_page_bw) || 0;
    return Math.round(EXAMPLE_PAGES * EXAMPLE_COPIES * bwRate * 100) / 100;
  }, [pricing.rate_per_page_bw]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (validationError) return;

    setSaveError("");
    setSaveSuccess("");
    setSaving(true);
    try {
      await api.patch("/shops/me/pricing", {
        rate_per_page_bw: Number(pricing.rate_per_page_bw),
        rate_per_page_color: Number(pricing.rate_per_page_color),
        // A4 is never sent - see the "Paper size" section below.
        paper_size_rates: { A3: Number(pricing.paper_size_rates.A3) },
        sides_extra_rate: Number(pricing.sides_extra_rate),
      });
      setSaveSuccess("Pricing saved.");
    } catch (err) {
      setSaveError(err.response?.data?.message || "Could not save pricing. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Separate endpoint (PATCH /shops/me/status) and separate save action
  // from the pricing form above - business_hours isn't a rate, so it
  // doesn't belong in the same submit. Saving refreshes AuthContext's
  // shop (refreshShop) so the sidebar's ShopOpenToggle picks up the new
  // schedule immediately, without a page reload.
  // What is actually STORED right now - distinct from `businessHours`,
  // which is the draft being edited. The summary above must never show a
  // typed-but-unsaved value.
  const savedHours = {
    enabled: !!shop?.business_hours?.enabled,
    open_time: shop?.business_hours?.open_time || "09:00",
    close_time: shop?.business_hours?.close_time || "21:00",
  };

  const handleSaveHours = async (e) => {
    e.preventDefault();
    if (businessHours.enabled && (!businessHours.open_time || !businessHours.close_time)) {
      setHoursError("Set both an opening and closing time to enable a schedule.");
      return;
    }

    setHoursError("");
    setHoursSuccess("");
    setHoursSaving(true);
    try {
      await api.patch("/shops/me/status", {
        business_hours: {
          enabled: businessHours.enabled,
          open_time: businessHours.open_time,
          close_time: businessHours.close_time,
        },
      });
      await refreshShop();
      setEditingHours(false);
      setHoursSuccess("Shop hours saved.");
    } catch (err) {
      setHoursError(err.response?.data?.message || "Could not save shop hours. Please try again.");
    } finally {
      setHoursSaving(false);
    }
  };

  return (
    <DashboardLayout>
      {/* max-w-7xl, the same container Dashboard and Orders use, so this
          page's left edge lines up with theirs instead of floating in the
          middle of the content area as a narrow column. */}
      <div className="max-w-7xl mx-auto flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text-primary">Services &amp; Pricing</h1>
            <p className="text-sm text-text-secondary mt-1 max-w-2xl">
              Set your shop&rsquo;s rates and services. Customers pay these rates plus the platform fee,
              which is set by Paprout and isn&rsquo;t editable here.
            </p>
          </div>

          {/* Outside the rates form but submits it, via form=. The action
              is reachable from the top of the page without the form
              needing to wrap the header. */}
          {!loading && !loadError && (
            <button
              type="submit"
              form={PRICING_FORM_ID}
              disabled={saving || !!validationError}
              className="shrink-0 px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          )}
        </header>

        <Panel as="form" onSubmit={handleSaveHours} className="p-5 flex flex-col gap-4">
          <PanelHeader
            title="Shop hours"
            subtitle="Optional automatic schedule — separate from the manual Open/Closed toggle in the sidebar."
          />

          {!editingHours ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {savedHours.enabled
                    ? `Open ${savedHours.open_time} - ${savedHours.close_time}, every day`
                    : "No automatic schedule"}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {savedHours.enabled
                    ? "Outside these hours your shop shows as closed to customers automatically."
                    : "Your shop follows only the manual Open/Closed toggle in the sidebar."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setHoursSuccess("");
                  setHoursError("");
                  setEditingHours(true);
                }}
                className="shrink-0 px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Switch
                checked={businessHours.enabled}
                onChange={(enabled) => setBusinessHours((h) => ({ ...h, enabled }))}
                label="Toggle automatic schedule"
              />
              <span className="text-sm font-medium text-text-primary">
                {businessHours.enabled ? "Schedule enabled" : "Schedule disabled"}
              </span>
            </div>
          )}

          {editingHours && businessHours.enabled && (
            <div className="grid sm:grid-cols-2 gap-4 max-w-sm">
              <div>
                <label htmlFor="open_time" className="block text-sm font-medium text-text-primary mb-1">
                  Opens at
                </label>
                <input
                  id="open_time"
                  type="time"
                  value={businessHours.open_time}
                  onChange={(e) => setBusinessHours((h) => ({ ...h, open_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="close_time" className="block text-sm font-medium text-text-primary mb-1">
                  Closes at
                </label>
                <input
                  id="close_time"
                  type="time"
                  value={businessHours.close_time}
                  onChange={(e) => setBusinessHours((h) => ({ ...h, close_time: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          {editingHours && (
            <p className="text-xs text-text-muted">
              When enabled, your shop will automatically show as closed outside these hours, in addition to
              the manual toggle above.
            </p>
          )}

          {hoursError && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{hoursError}</p>}
          {hoursSuccess && (
            <p className="text-sm text-success-text bg-success-bg rounded-control p-3">{hoursSuccess}</p>
          )}

          {editingHours && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={hoursSaving}
                className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
              >
                {hoursSaving ? "Saving..." : "Save hours"}
              </button>
              {/* Only offered once something is stored to fall back to -
                  with no saved schedule there is nothing to cancel to. */}
              {savedHours.enabled && (
                <button
                  type="button"
                  disabled={hoursSaving}
                  onClick={() => {
                    setBusinessHours(savedHours);
                    setHoursError("");
                    setEditingHours(false);
                  }}
                  className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </Panel>

        {loading ? (
          <Panel className="p-8 text-center text-sm text-text-secondary">Loading your pricing...</Panel>
        ) : loadError ? (
          <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{loadError}</p>
        ) : (
          <form id={PRICING_FORM_ID} onSubmit={handleSave} className="flex flex-col gap-4">
            {/* Two sections across the width on a wide screen rather than
                one narrow column down the middle. The inputs themselves
                stay input-sized - a rupee amount in a 600px box reads as a
                mistake. */}
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel className="p-5 flex flex-col gap-4">
                <PanelHeader title="Print rates" subtitle="Charged per page, per copy." />
                <div className="grid sm:grid-cols-2 gap-4">
                  <RateInput
                    id="rate_bw"
                    label="B&W rate per page"
                    prefix="₹"
                    value={pricing.rate_per_page_bw}
                    onChange={(v) => setField("rate_per_page_bw", v)}
                  />
                  <RateInput
                    id="rate_color"
                    label="Colour rate per page"
                    prefix="₹"
                    value={pricing.rate_per_page_color}
                    onChange={(v) => setField("rate_per_page_color", v)}
                  />
                </div>
              </Panel>

              {/* Paper size and sides are one section: both are per-page
                  surcharges on top of the rates above, and splitting them
                  into two panels of two fields was what made this page
                  read as a stack of near-empty boxes. */}
              <Panel className="p-5 flex flex-col gap-4">
                <PanelHeader title="Paper &amp; sides" subtitle="Added on top of your per-page rate." />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <span className="block text-sm font-medium text-text-primary mb-1">A4</span>
                    {/* Not an input: A4 is the reference size the other
                        rates are quoted against, and is never edited or
                        sent to the server. */}
                    <div className="h-10 px-3 flex items-center border border-border rounded-control text-sm bg-background-soft text-text-muted">
                      ₹0 extra &middot; reference size
                    </div>
                  </div>
                  <RateInput
                    id="rate_a3"
                    label="A3 surcharge per page"
                    prefix="₹"
                    value={pricing.paper_size_rates.A3}
                    onChange={setA3}
                  />
                </div>

                <div className="pt-4 border-t border-border grid sm:grid-cols-2 gap-4 items-start">
                  {/* A plain rupee amount, exactly like the A3 surcharge
                      above. It used to be a percentage of the page
                      subtotal, which meant this number silently changed
                      what duplex cost every time the per-page rates were
                      edited - and charged four times as much on a colour
                      page as a B&W one for the same work. */}
                  <RateInput
                    id="rate_sides"
                    label="Double-sided, extra per page"
                    prefix="₹"
                    value={pricing.sides_extra_rate}
                    onChange={(v) => setField("sides_extra_rate", v)}
                  />
                  <p className="text-xs text-text-secondary sm:mt-7">
                    Charged on every page printed double-sided. Single-sided costs nothing extra.
                  </p>
                </div>
              </Panel>
            </div>

            {/* --- preview + save, one strip ------------------------- */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-panel border border-border bg-primary-wash">
              <div className="min-w-0">
                <p className="text-xs text-text-secondary">
                  {EXAMPLE_PAGES} pages &middot; B&amp;W &middot; {EXAMPLE_COPIES} copy &middot; A4 &middot;
                  single-sided
                </p>
                <p className="text-sm font-medium text-text-primary">
                  Estimated customer print cost:{" "}
                  <span className="font-heading font-bold text-primary-deep">₹{exampleTotal}</span>
                  <span className="text-xs font-normal text-text-muted">
                    {" "}
                    — your rate only, before the platform fee
                  </span>
                </p>
              </div>

              <button
                type="submit"
                disabled={saving || !!validationError}
                className="shrink-0 px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>

            {validationError && (
              <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{validationError}</p>
            )}
            {saveError && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{saveError}</p>}
            {saveSuccess && (
              <p className="text-sm text-success-text bg-success-bg rounded-control p-3">{saveSuccess}</p>
            )}
          </form>
        )}

        {/* Outside the form above on purpose: each service saves through
            its own route the moment it changes, rather than waiting on
            this page's Save. */}
        {/* Anchored so the dashboard's "Manage services" quick action
            lands on this section rather than the top of the page. */}
        <div id="services" className="scroll-mt-6">
          {!loading && !loadError && <ServicesManager />}
        </div>
      </div>
    </DashboardLayout>
  );
}

// ₹-prefixed or %-suffixed number input - the shared look for every rate
// field on this page.
function RateInput({ id, label, value, onChange, prefix }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-primary mb-1">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Capped rather than full-width: these are two- and three-digit
          // rupee amounts, and a field stretched across half the page
          // reads as though a much longer value is expected.
          className={`w-full max-w-[220px] h-10 pr-3 border border-border rounded-control text-sm tabular-nums focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 ${
            prefix ? "pl-7" : "pl-3"
          }`}
        />
      </div>
    </div>
  );
}

// One toggleable service row: a switch plus a rate field that's only
// rendered at all while the service is on - an "Off" service has nothing
// to sanity-check, so there's nothing to show instead of a greyed-out
// input.

