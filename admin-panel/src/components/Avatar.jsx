import { useEffect, useState } from "react";

// A small circular photo with a fallback, used for shop and owner photos
// in the tables here.
//
// A photo is optional throughout this system - vendor onboarding does not
// require either one - so "no photo" is a normal state, not an error, and
// gets a neutral glyph rather than a broken image or an empty hole that
// misaligns the row.
//
// A URL that is present but fails to load falls back to the same glyph:
// an admin scanning a table does not need to be told a CDN request
// failed, and a broken-image icon in every row would be worse than none.
export default function Avatar({ src, alt, kind = "shop", size = 32 }) {
  const [failed, setFailed] = useState(false);

  // Reset when pointed at a different photo, or a filtered re-render
  // would keep showing the fallback for a row that now has a good URL.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const dimension = { width: size, height: size };

  if (!src || failed) {
    return (
      <span
        style={dimension}
        aria-hidden="true"
        className="shrink-0 rounded-full bg-background-soft border border-border grid place-items-center text-text-muted"
      >
        {kind === "owner" ? <IconPerson /> : <IconStore />}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt || ""}
      style={dimension}
      onError={() => setFailed(true)}
      // object-cover so a portrait storefront photo fills the circle
      // instead of being squashed into it.
      className="shrink-0 rounded-full object-cover border border-border bg-background-soft"
    />
  );
}

function IconStore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function IconPerson() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
