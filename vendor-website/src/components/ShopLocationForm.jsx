import { useState } from "react";
import Panel, { PanelHeader } from "./dashboard/Panel";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// "Location" section of the shop profile - PATCH /shops/me/location.
//
// Two ways to set coordinates: the browser's geolocation (only accurate if
// the vendor is physically at the shop, which the copy says), or typing
// latitude/longitude by hand when permission is denied or they want to be
// precise. The locality label is separate from the pin - it's what
// customers type into search (GET /shops ?search=).
//
// GeoJSON stores [longitude, latitude]; everything in this component uses
// the human order (latitude first) and only the API body names them.

const MAX_LOCALITY_LENGTH = 120; // matches updateMyLocation in shopController.js

function initialFromShop(shop) {
  const [lng, lat] = shop?.location?.coordinates || [];
  return {
    latitude: lat !== undefined ? String(lat) : "",
    longitude: lng !== undefined ? String(lng) : "",
    locality: shop?.locality || "",
  };
}

// Returns { lat, lng } when both inputs are valid, otherwise null.
function parseCoordinates(latitude, longitude) {
  if (latitude.trim() === "" || longitude.trim() === "") return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// OpenStreetMap's own embed page - no API key, no script. A small
// bounding box around the point (~500 m each way) with a marker on it.
function osmEmbedUrl({ lat, lng }) {
  const d = 0.005;
  const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

const GEO_ERRORS = {
  1: "Location permission was denied. Allow location access for this site in your browser, or enter the coordinates below.",
  2: "Your device couldn't work out its location. Try again outdoors or near a window, or enter the coordinates below.",
  3: "Finding your location took too long. Try again, or enter the coordinates below.",
};

export default function ShopLocationForm() {
  const { shop, refreshShop } = useAuth();

  const [form, setForm] = useState(() => initialFromShop(shop));
  const [locating, setLocating] = useState(false);
  const [accuracyM, setAccuracyM] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const coords = parseCoordinates(form.latitude, form.longitude);
  const isSaved = Boolean(shop?.location?.coordinates?.length);

  const setField = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setSuccess("");
    if (field !== "locality") setAccuracyM(null); // typed coordinates no longer match the GPS reading
  };

  const useCurrentLocation = () => {
    setError("");
    setSuccess("");
    // Browsers only expose geolocation on HTTPS (or localhost).
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      setError("This browser can't share your location here. Enter the coordinates below instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((f) => ({
          ...f,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setAccuracyM(Math.round(position.coords.accuracy));
        setLocating(false);
      },
      (geoError) => {
        setError(GEO_ERRORS[geoError.code] || "Couldn't get your location. Enter the coordinates below instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!coords) {
      setError("Enter a latitude between -90 and 90 and a longitude between -180 and 180, or use your current location.");
      return;
    }
    if (form.locality.trim().length > MAX_LOCALITY_LENGTH) {
      setError(`Keep the locality under ${MAX_LOCALITY_LENGTH} characters.`);
      return;
    }

    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const { data } = await api.patch("/shops/me/location", {
        latitude: coords.lat,
        longitude: coords.lng,
        locality: form.locality.trim(),
      });
      await refreshShop();
      setSuccess(data.locality ? `Location saved: ${data.locality}` : "Location saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save your location. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full h-10 px-3 border border-border rounded-control text-sm tabular-nums focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20";

  return (
    <Panel as="form" onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
      <PanelHeader
        title="Shop location"
        subtitle={`Help customers find your shop easily.${isSaved ? "" : " Not set yet."}`}
      />

      {/* Controls on the left, the map on the right at a size worth
          looking at. Below xl they stack, map last, so a narrow screen
          gets the fields first. */}
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="self-start inline-flex items-center gap-2 px-4 h-10 rounded-control border border-primary text-primary-bright text-sm font-semibold hover:bg-primary-wash disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                <circle cx="12" cy="12" r="7" />
              </svg>
              {locating ? "Finding your location..." : "Use my current location"}
            </button>
            <p className="text-xs text-text-muted">
              Tap this while you&rsquo;re at your shop for the most accurate location.
            </p>
            {accuracyM !== null && (
              <p className="text-xs text-text-secondary">
                Accurate to about {accuracyM} m.
                {accuracyM > 100 && " That's quite rough - check the map, or enter the coordinates by hand."}
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="shop_latitude" className="block text-sm font-medium text-text-primary mb-1">
                Latitude
              </label>
              <input
                id="shop_latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                inputMode="decimal"
                value={form.latitude}
                onChange={(e) => setField("latitude", e.target.value)}
                placeholder="e.g. 30.268900"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="shop_longitude" className="block text-sm font-medium text-text-primary mb-1">
                Longitude
              </label>
              <input
                id="shop_longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                inputMode="decimal"
                value={form.longitude}
                onChange={(e) => setField("longitude", e.target.value)}
                placeholder="e.g. 77.993100"
                className={inputClass}
              />
            </div>
          </div>
          <p className="text-xs text-text-muted -mt-2">
            To copy these from Google Maps, long-press your shop on the map - the first number is
            latitude, the second is longitude.
          </p>

          <div>
            <label htmlFor="shop_locality" className="block text-sm font-medium text-text-primary mb-1">
              Locality / landmark
            </label>
            <input
              id="shop_locality"
              value={form.locality}
              onChange={(e) => setField("locality", e.target.value)}
              maxLength={MAX_LOCALITY_LENGTH}
              placeholder="e.g. Near Graphic Era University"
              className="w-full h-10 px-3 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
            <p className="text-xs text-text-muted mt-1">
              This is what customers search by, so use the name people actually say - a college, market
              or landmark nearby.
            </p>
          </div>
        </div>

        {/* The map. Large enough to actually check the pin against a
            street, which the old 100px strip never was. */}
        <div className="min-w-0 flex flex-col">
          <p className="text-xs font-medium text-text-secondary mb-1.5">
            {coords && !isSaved ? "Map preview - check the pin is on your shop before saving" : "Map preview"}
          </p>

          <div className="relative flex-1 min-h-[18rem] rounded-card border border-border overflow-hidden bg-background-soft">
            {coords ? (
              <>
                <iframe
                  key={`${coords.lat},${coords.lng}`}
                  title="Map preview of your shop location"
                  src={osmEmbedUrl(coords)}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                {/* The embed draws its own marker; this is the readable
                    label over it, since that pin is small and unlabelled. */}
                <span className="absolute left-3 bottom-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface/95 border border-border shadow-card text-xs font-semibold text-text-primary">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="tabular-nums">
                    {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                  </span>
                </span>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-6">
                <span aria-hidden="true" className="w-10 h-10 rounded-full bg-primary-wash text-primary-bright grid place-items-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-text-primary">No location set</p>
                <p className="text-xs text-text-secondary">
                  Use your current location, or type the coordinates, and the map appears here.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">Map data &copy; OpenStreetMap contributors</p>
        </div>
      </div>

      {error && <p className="text-sm text-error-text bg-error-bg rounded-control p-3">{error}</p>}
      {success && (
        <p className="text-sm text-success-text bg-success-bg rounded-control p-3 motion-safe:animate-[printlly-rise_220ms_ease-out]">
          {success}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={saving || locating}
          className="px-5 h-10 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {saving ? "Saving..." : isSaved ? "Update location" : "Save location"}
        </button>
      </div>
    </Panel>
  );
}
