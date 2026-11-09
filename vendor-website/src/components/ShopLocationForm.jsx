import { useState } from "react";
import Panel, { PanelHeader } from "./dashboard/Panel";
import ShopLocationFields from "./ShopLocationFields";
import { initialLocation, parseCoordinates } from "../utils/shopLocation";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function ShopLocationForm() {
  const { shop, refreshShop } = useAuth();
  const [form, setForm] = useState(() => initialLocation(shop));
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event) {
    event.preventDefault();
    const pin = parseCoordinates(form.latitude, form.longitude);
    if (!form.google_maps_url || !form.address.trim()) {
      setError(
        "Paste your Google Maps link and confirm the shop's address before saving.",
      );
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.patch("/shops/me/location", {
        latitude: pin?.lat,
        longitude: pin?.lng,
        google_maps_url: form.google_maps_url,
        google_maps_embed_url: form.google_maps_embed_url,
        locality: form.locality.trim(),
        address: [unit.trim(), form.address].filter(Boolean).join(", "),
      });
      await refreshShop();
      setSuccess("Shop location and address saved.");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not save your location. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel as="form" onSubmit={save} className="space-y-4 p-5">
      <PanelHeader
        title="Shop location"
        subtitle="The same pin and address customers see in the app."
      />
      <ShopLocationFields
        value={form}
        onChange={(next) => {
          setForm(next);
          setSuccess("");
        }}
      />
      <div>
        <label
          htmlFor="location-unit"
          className="mb-2 block text-sm font-medium"
        >
          Add shop / floor number (optional)
        </label>
        <input
          id="location-unit"
          value={unit}
          maxLength={100}
          onChange={(event) => setUnit(event.target.value)}
          className="w-full rounded-control border border-border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label
          htmlFor="shop-locality"
          className="mb-2 block text-sm font-medium"
        >
          Locality / landmark
        </label>
        <input
          id="shop-locality"
          value={form.locality}
          maxLength={120}
          onChange={(event) => {
            setForm({ ...form, locality: event.target.value });
            setSuccess("");
          }}
          className="w-full rounded-control border border-border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-text-muted">
          Customers can search for this area or landmark.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error-text">
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
        {saving ? "Saving…" : "Save shop location"}
      </button>
    </Panel>
  );
}
