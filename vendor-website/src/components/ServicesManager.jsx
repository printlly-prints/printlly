import { useEffect, useState } from "react";
import Panel, { PanelHeader } from "./dashboard/Panel";
import Switch from "./Switch";
import api from "../api/axios";

// A shop's finishing services: a list the vendor defines themselves, with
// their own names and prices ("Matte Lamination", "Hole Punching",
// "Perfect Binding"), rather than a fixed set this codebase invented.
//
// Deliberately NOT part of the pricing form it sits next to. Each service
// has its own route (POST/PATCH/DELETE /shops/me/pricing/services) and
// saves on its own, so adding one doesn't require saving the page's rates
// too, and a failure on one can't roll back the others. PATCH
// /shops/me/pricing rejects a `services` field outright now.
//
// Every route returns the FULL list back, so this re-renders from the
// server's answer rather than guessing what changed locally.
//
// Existing shops were pre-populated with Spiral Binding / Stapling /
// Lamination by scripts/migrateServicesToArray.js. There is nothing
// special about those three any more - they rename, re-price, disable and
// delete exactly like anything the vendor adds themselves.
const MAX_SERVICES = 20;
const MAX_NAME_LENGTH = 60;

export default function ServicesManager() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Which row is in edit mode, and which row has a request in flight.
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/shops/me/pricing")
      .then(({ data }) => {
        if (!cancelled) setServices(data.services || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Could not load your services.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = async ({ name, rate }) => {
    setError("");
    try {
      const { data } = await api.post("/shops/me/pricing/services", { name, rate });
      setServices(data);
      setShowAddForm(false);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Could not add that service.");
      return false;
    }
  };

  const handleUpdate = async (service, patch) => {
    setBusyId(service._id);
    setError("");
    try {
      const { data } = await api.patch(`/shops/me/pricing/services/${service._id}`, patch);
      setServices(data);
      setEditingId(null);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || "Could not save that change.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (service) => {
    // Deleting is genuinely safe for past orders - each order stores a
    // snapshot of the name and price it was sold at, not a live reference
    // (see models/Order.js) - so the confirmation says so rather than
    // leaving a vendor to guess whether they are about to break history.
    const confirmed = window.confirm(
      `Remove "${service.name}"?\n\nThis won't affect past orders, only new ones.`
    );
    if (!confirmed) return;

    setBusyId(service._id);
    setError("");
    try {
      const { data } = await api.delete(`/shops/me/pricing/services/${service._id}`);
      setServices(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove that service.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel className="p-5">
      <PanelHeader
        title="Finishing options"
        subtitle="Whatever finishing you offer, named however you like. Customers can only request a service listed here, and each is charged once per document."
        className="mb-4"
        action={
          // The add action sits in the header once there is a list, so it
          // stays reachable without scrolling past every service.
          !loading && services.length > 0 && services.length < MAX_SERVICES && !showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setError("");
                setEditingId(null);
                setShowAddForm(true);
              }}
              className="shrink-0 px-4 h-9 rounded-control border border-primary text-primary-bright text-sm font-semibold hover:bg-primary-wash transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              + Add a service
            </button>
          ) : null
        }
      />

      {loading ? (
        <p className="text-sm text-text-secondary">Loading your services...</p>
      ) : (
        <>
          {services.length === 0 && !showAddForm ? (
            // A shop with no services can't sell any finishing at all, and
            // an empty list doesn't say that - it just looks like a list
            // that happens to be empty. This says what's missing and makes
            // the one useful action the obvious thing on screen.
            <div className="bg-background-soft rounded-control p-6 text-center">
              <p className="text-sm font-medium text-text-primary">
                You haven&rsquo;t added any print services yet
              </p>
              <p className="text-sm text-text-secondary mt-1 mb-4">
                Add your first one &mdash; like Spiral Binding or Lamination &mdash; so customers can order
                it.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setEditingId(null);
                  setShowAddForm(true);
                }}
                className="px-5 py-2.5 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                + Add a service
              </button>
            </div>
          ) : services.length === 0 ? null : (
            <ul className="mb-4 rounded-card border border-border overflow-hidden divide-y divide-border">
              {services.map((service) =>
                editingId === service._id ? (
                  <li key={service._id} className="px-3 py-3 bg-background-soft/50">
                    <ServiceForm
                      initialName={service.name}
                      initialRate={String(service.rate)}
                      submitLabel="Save"
                      busy={busyId === service._id}
                      onSubmit={(values) => handleUpdate(service, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <ServiceRow
                    key={service._id}
                    service={service}
                    busy={busyId === service._id}
                    onToggle={(enabled) => handleUpdate(service, { enabled })}
                    onEdit={() => {
                      setError("");
                      setEditingId(service._id);
                    }}
                    onDelete={() => handleDelete(service)}
                  />
                )
              )}
            </ul>
          )}

          {services.length >= MAX_SERVICES ? (
            <p className="text-sm text-text-muted">
              You&rsquo;ve reached the maximum of {MAX_SERVICES} services. Remove one to add another.
            </p>
          ) : showAddForm ? (
            // No top border when this is the only thing here - there is
            // nothing above it to be divided from.
            <div className={services.length > 0 ? "pt-4 border-t border-border" : ""}>
              <ServiceForm
                initialName=""
                initialRate=""
                submitLabel="Add service"
                autoFocus
                onSubmit={handleAdd}
                onCancel={() => {
                  setShowAddForm(false);
                  setError("");
                }}
              />
            </div>
          ) : null}
        </>
      )}

      {error && <p className="text-sm text-error-text bg-error-bg rounded-control p-3 mt-3">{error}</p>}
    </Panel>
  );
}

// One service at rest: what it's called, what it costs, whether customers
// can currently order it, and the two actions.
function ServiceRow({ service, busy, onToggle, onEdit, onDelete }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 bg-surface transition-colors duration-200 hover:bg-primary-wash/50">
      {/* Off keeps the name and price but hides the service from
          customers - for when the laminator is broken, not for deleting. */}
      <Switch checked={service.enabled} onChange={onToggle} label={`Toggle ${service.name}`} />

      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-medium truncate ${
            service.enabled ? "text-text-primary" : "text-text-muted line-through"
          }`}
        >
          {service.name}
        </span>
        {/* Off keeps the name and price but hides the service from
            customers, so the row says which it is rather than looking
            like a greyed-out bug. */}
        {!service.enabled && (
          <span className="block text-xs text-text-muted">Not orderable while off</span>
        )}
      </span>

      <span className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">
        ₹{service.rate}
        <span className="text-xs font-normal text-text-muted">/document</span>
      </span>

      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        aria-label={`Edit ${service.name}`}
        title="Edit"
        className="p-2 rounded-control text-text-secondary hover:text-primary-bright hover:bg-primary-wash disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <IconPencil />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label={`Remove ${service.name}`}
        title="Remove"
        className="p-2 rounded-control text-text-secondary hover:text-error-text hover:bg-error-bg disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <IconTrash />
      </button>
    </li>
  );
}

// Shared by "add" and "edit" - the same two fields either way, so they
// can't drift apart in validation or layout.
//
// A real <form> so Enter submits. This section is rendered OUTSIDE the
// page's rates form (see PricingPage.jsx) precisely so this is a valid,
// independent form rather than an invalid nested one - services save
// through their own routes, not that form's Save button.
function ServiceForm({ initialName, initialRate, submitLabel, busy, autoFocus, onSubmit, onCancel }) {
  const [name, setName] = useState(initialName);
  const [rate, setRate] = useState(initialRate);
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Give the service a name.");
      return;
    }
    const value = Number(rate);
    if (rate === "" || Number.isNaN(value) || value < 0) {
      setLocalError("Set a price of 0 or more.");
      return;
    }

    setLocalError("");
    setSaving(true);
    await onSubmit({ name: trimmed, rate: value });
    setSaving(false);
  };

  const disabled = saving || busy;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[12rem]">
        <label className="block text-sm font-medium text-text-primary mb-1">
          Service name
          <input
            type="text"
            maxLength={MAX_NAME_LENGTH}
            value={name}
            autoFocus={autoFocus}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Matte Lamination"
            className="mt-1 w-full px-3 py-2 border border-border rounded-control text-sm font-normal focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          Price
          <span className="mt-1 flex items-center gap-1.5">
            <span className="text-sm text-text-secondary">₹</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-24 px-3 py-2 border border-border rounded-control text-sm text-right font-normal focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="px-4 py-2 rounded-control bg-primary text-white text-sm font-medium hover:bg-primary-deep disabled:opacity-50"
      >
        {disabled ? "Saving..." : submitLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="px-4 py-2 rounded-control border border-border text-sm font-medium text-text-primary hover:bg-background-soft disabled:opacity-50"
      >
        Cancel
      </button>

      {localError && <p className="w-full text-sm text-error-text">{localError}</p>}
    </form>
  );
}

// Inline SVG, matching Sidebar.jsx's approach - this dashboard has no icon
// dependency and isn't gaining one for two glyphs.
function IconPencil() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
