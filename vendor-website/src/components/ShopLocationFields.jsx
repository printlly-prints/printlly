import { useEffect, useId, useRef, useState } from "react";
import { MapPin, ExternalLink, Check } from "lucide-react";
import api from "../api/axios";

export default function ShopLocationFields({ value, onChange }) {
  const id = useId();
  const [input, setInput] = useState(value.google_maps_url || "");
  const [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function preview() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    setError("");
    try {
      const { data } = await api.post(
        "/shops/google-maps-preview",
        { url: input },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        onChange({
          ...value,
          ...data,
          latitude: data.latitude === undefined ? "" : String(data.latitude),
          longitude: data.longitude === undefined ? "" : String(data.longitude),
        });
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err.response?.data?.message ||
            "Couldn't preview this Google Maps link. Check the link and retry.",
        );
    } finally {
      if (!controller.signal.aborted) setWorking(false);
    }
  }
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-medium">
          Google Maps shop link
        </label>
        <input
          id={id}
          type="url"
          value={input}
          maxLength={12000}
          placeholder="Paste your shop's Google Maps share link"
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); preview(); } }}
          onChange={(event) => {
            request.current?.abort();
            setWorking(false);
            setError("");
            setInput(event.target.value);
            onChange({
              ...value,
              google_maps_url: "",
              google_maps_embed_url: "",
              latitude: "",
              longitude: "",
              address: "",
            });
          }}
          className="w-full rounded-control border border-border px-3 py-2 text-sm leading-6"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={working || !input.trim()}
          onClick={preview}
          className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
        >
          <MapPin size={16} aria-hidden="true" />
          {working ? "Loading map…" : "Preview Google Maps"}
        </button>
        <a
          href="https://www.google.com/maps"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary"
        >
          Find your shop <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">
          Where do I get the link?
        </summary>
        <ol className="mt-2 list-inside list-decimal space-y-2 text-xs leading-6 text-text-secondary">
          <li>Open your shop's listing in Google Maps.</li>
          <li>Choose Share, then Copy link.</li>
        </ol>
      </details>
      {error && (
        <p
          role="alert"
          className="rounded-control bg-error-bg p-3 text-sm text-error-text"
        >
          {error}
        </p>
      )}
      {value.google_maps_embed_url ? (
        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border bg-primary-wash px-4 py-3 text-sm font-medium text-primary-deep">
            <Check size={16} aria-hidden="true" />
            Google Maps location
          </div>
          <iframe
            title="Your shop on Google Maps"
            src={value.google_maps_embed_url}
            width="100%"
            height="340"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="block w-full border-0"
          />
          <a
            href={value.google_maps_url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center justify-between border-t border-border px-4 text-sm font-medium text-primary"
          >
            Open in Google Maps <ExternalLink size={15} aria-hidden="true" />
          </a>
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-card border border-dashed border-border bg-background-soft p-5 text-sm leading-6 text-text-secondary">
          <MapPin
            size={24}
            className="shrink-0 text-primary"
            aria-hidden="true"
          />
          <p>
            Your shop's Google map will appear here after you paste its link.
          </p>
        </div>
      )}
      {value.google_maps_url && (
        <div>
          <label
            htmlFor={id + "-address"}
            className="mb-2 block text-sm font-medium"
          >
            Shop address
          </label>
          <p className="mb-2 text-xs leading-5 text-text-secondary">
            Confirm the street address shown on your Google Maps card.
          </p>
          <textarea
            id={id + "-address"}
            required
            rows={2}
            value={value.address}
            onChange={(event) =>
              onChange({ ...value, address: event.target.value })
            }
            placeholder="Shop address from your Google listing"
            className="w-full rounded-control border border-border px-3 py-2 text-sm leading-6"
          />
        </div>
      )}
    </div>
  );
}
