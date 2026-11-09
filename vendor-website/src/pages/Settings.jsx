import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import Panel, { PanelHeader } from "../components/dashboard/Panel";
import { useAuth } from "../context/AuthContext";

export default function Settings() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.next !== form.confirm) {
      setError("The new passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const data = await changePassword(form.current, form.next);
      setSuccess(data.message);
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not change your password. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Your account and sign-in security.
          </p>
        </header>
        <Panel className="p-5">
          <PanelHeader
            title="Your account"
            subtitle="The account linked to your shop."
          />
          <dl className="mt-5 grid gap-5 sm:grid-cols-3">
            {[
              ["Name", user?.name],
              ["Email", user?.email],
              ["Phone", user?.phone],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-text-secondary">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {value || "Not provided"}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel as="form" onSubmit={submit} className="space-y-5 p-5">
          <PanelHeader
            title="Change password"
            subtitle="For accounts that sign in with email and password. Google accounts manage their password through Google."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["current", "Current password", "current-password"],
              ["next", "New password", "new-password"],
              ["confirm", "Confirm new password", "new-password"],
            ].map(([field, label, autoComplete]) => (
              <div
                key={field}
                className={
                  field === "current" ? "sm:col-span-2 sm:max-w-sm" : ""
                }
              >
                <label
                  htmlFor={`password-${field}`}
                  className="mb-2 block text-sm font-medium"
                >
                  {label}
                </label>
                <input
                  id={`password-${field}`}
                  type="password"
                  value={form[field]}
                  autoComplete={autoComplete}
                  minLength={field === "current" ? undefined : 10}
                  maxLength={72}
                  required
                  onChange={(event) =>
                    setForm({ ...form, [field]: event.target.value })
                  }
                  className="w-full rounded-control border border-border px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-text-secondary">
            Use at least 10 characters. Changing your password signs out your
            other devices.
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-control bg-error-bg p-3 text-sm text-error-text"
            >
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-success-text">
              {success}
            </p>
          )}
          <button
            disabled={saving}
            className="min-h-11 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </Panel>
      </div>
    </DashboardLayout>
  );
}
