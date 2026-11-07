import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import AdminLayout from "../components/AdminLayout";
import ConfirmDialog from "../components/ConfirmDialog";
import { ErrorNote, FilterSelect, Loading, PageHeader } from "../components/ui";

// The global Settings document - the only genuinely platform-wide pricing
// left (every print rate is per-shop, set by each vendor).
//
// Saving here changes what every future order is charged and how busy
// every shop appears, immediately: the backend drops its settings cache on
// write, so there is no grace period in which to notice a mistake. That is
// why this is the one form in the panel behind a confirmation.
export default function Settings() {
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/admin/settings");
        if (cancelled) return;
        const loaded = {
          platform_fee_type: data.platform_fee_type,
          platform_fee_value: String(data.platform_fee_value ?? ""),
          low_max: String(data.rush_thresholds?.low_max ?? ""),
          medium_max: String(data.rush_thresholds?.medium_max ?? ""),
        };
        setForm(loaded);
        setOriginal(loaded);
      } catch (err) {
        if (!cancelled) setLoadError(err.response?.data?.message || "Could not load platform settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirrors PATCH /admin/settings' own validation so a mistake is caught
  // before a round-trip - the server still re-checks everything.
  const validationError = useMemo(() => {
    if (!form) return "";
    const fee = Number(form.platform_fee_value);
    if (form.platform_fee_value === "" || Number.isNaN(fee) || fee < 0) {
      return "Platform fee must be a number of 0 or more.";
    }
    if (form.platform_fee_type === "percentage" && fee > 100) {
      return "A percentage fee above 100% would charge more than the order itself.";
    }
    const low = Number(form.low_max);
    const medium = Number(form.medium_max);
    if (!Number.isInteger(low) || low < 0) return "Low rush threshold must be a whole number of 0 or more.";
    if (!Number.isInteger(medium) || medium < 0) return "Medium rush threshold must be a whole number of 0 or more.";
    if (medium <= low) return "Medium threshold must be greater than the low threshold.";
    return "";
  }, [form]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaveError("");
    setSaving(true);
    try {
      const { data } = await api.patch("/admin/settings", {
        platform_fee_type: form.platform_fee_type,
        platform_fee_value: Number(form.platform_fee_value),
        rush_thresholds: { low_max: Number(form.low_max), medium_max: Number(form.medium_max) },
      });
      const saved = {
        platform_fee_type: data.platform_fee_type,
        platform_fee_value: String(data.platform_fee_value),
        low_max: String(data.rush_thresholds.low_max),
        medium_max: String(data.rush_thresholds.medium_max),
      };
      setForm(saved);
      setOriginal(saved);
      setConfirming(false);
      setSuccess("Platform settings saved. New orders use these immediately.");
    } catch (err) {
      setSaveError(err.response?.data?.message || "Could not save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const dirty = original && form && JSON.stringify(original) !== JSON.stringify(form);

  return (
    <AdminLayout>
      <PageHeader
        title="Platform Settings"
        description="The only pricing that is platform-wide. Per-page print rates belong to each shop."
      />

      <ErrorNote>{loadError}</ErrorNote>

      {loading ? (
        <Loading label="Loading settings..." />
      ) : form ? (
        <div className="max-w-xl space-y-5">
          <section className="bg-surface border border-border rounded-panel p-5 space-y-4">
            <div>
              <h2 className="font-heading font-bold text-text-primary">Platform fee</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                Added on top of every order, on top of whatever the shop charges.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FilterSelect
                label="Fee type"
                value={form.platform_fee_type}
                onChange={(value) => set("platform_fee_type", value)}
                options={[
                  { value: "flat", label: "Flat (₹ per order)" },
                  { value: "percentage", label: "Percentage of order" },
                ]}
              />

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">
                  {form.platform_fee_type === "percentage" ? "Fee percentage" : "Fee amount"}
                </span>
                <div className="relative">
                  {form.platform_fee_type === "flat" && (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
                      ₹
                    </span>
                  )}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.platform_fee_value}
                    onChange={(e) => set("platform_fee_value", e.target.value)}
                    className={`w-full py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 ${
                      form.platform_fee_type === "flat" ? "pl-7 pr-3" : "pl-3 pr-8"
                    }`}
                  />
                  {form.platform_fee_type === "percentage" && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
                      %
                    </span>
                  )}
                </div>
              </label>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-panel p-5 space-y-4">
            <div>
              <h2 className="font-heading font-bold text-text-primary">Rush thresholds</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                How many active orders make a shop look Low, Medium or High rush to customers.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">Low up to</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.low_max}
                  onChange={(e) => set("low_max", e.target.value)}
                  className="px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">Medium up to</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.medium_max}
                  onChange={(e) => set("medium_max", e.target.value)}
                  className="px-3 py-2 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </label>
            </div>

            <p className="text-xs text-text-muted">
              Low: 0&ndash;{form.low_max || "?"} active orders · Medium: {Number(form.low_max || 0) + 1}&ndash;
              {form.medium_max || "?"} · High: anything above {form.medium_max || "?"}.
            </p>
          </section>

          {validationError && (
            <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{validationError}</p>
          )}
          {saveError && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{saveError}</p>}
          {success && <p className="text-sm text-success-text bg-success-bg rounded-control p-3">{success}</p>}

          <button
            type="button"
            onClick={() => {
              setSuccess("");
              setSaveError("");
              setConfirming(true);
            }}
            disabled={!dirty || Boolean(validationError)}
            className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
          >
            Save changes
          </button>
          {!dirty && <span className="ml-3 text-xs text-text-muted">No changes to save.</span>}
        </div>
      ) : null}

      {confirming && (
        <ConfirmDialog
          title="Apply these platform settings?"
          confirmLabel="Yes, save"
          loading={saving}
          error={saveError}
          onCancel={() => setConfirming(false)}
          onConfirm={save}
        >
          <p>This affects live pricing across the whole platform, starting with the very next order.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Platform fee:{" "}
              <span className="font-medium text-text-primary">
                {form?.platform_fee_type === "percentage"
                  ? `${form?.platform_fee_value}% of each order`
                  : `₹${form?.platform_fee_value} per order`}
              </span>
            </li>
            <li>
              Rush thresholds:{" "}
              <span className="font-medium text-text-primary">
                low ≤ {form?.low_max}, medium ≤ {form?.medium_max}
              </span>
            </li>
          </ul>
        </ConfirmDialog>
      )}
    </AdminLayout>
  );
}
