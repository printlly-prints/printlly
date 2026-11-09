const GOOGLE_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.in",
  "www.google.co.in",
  "maps.google.co.in",
  "maps.app.goo.gl",
  "goo.gl",
]);
export function isGoogleMapsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      GOOGLE_HOSTS.has(url.hostname) &&
      (url.hostname === "maps.app.goo.gl" ||
        url.hostname.startsWith("maps.google.") ||
        /^\/maps(?:\/|$)/.test(url.pathname))
    );
  } catch {
    return false;
  }
}
export function shopMaps(shop) {
  const coords = shop?.location?.coordinates;
  const pin =
    Array.isArray(coords) &&
    coords.length === 2 &&
    coords.every(Number.isFinite) &&
    Math.abs(coords[0]) <= 180 &&
    Math.abs(coords[1]) <= 90;
  const query = pin
    ? `${coords[1]},${coords[0]}`
    : [shop?.shop_name, shop?.address].filter(Boolean).join(" ");
  const url = isGoogleMapsUrl(shop?.google_maps_url)
    ? shop.google_maps_url
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  // Coordinates keep the embedded preview focused on the pickup pin.
  const embed = pin
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`
    : isGoogleMapsUrl(shop?.google_maps_embed_url)
      ? shop.google_maps_embed_url
      : null;
  return { url, embed };
}
export function googleMapHtml(url) {
  if (!isGoogleMapsUrl(url)) return "";
  const escaped = url
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:white}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="Shop location on Google Maps" src="${escaped}" allowfullscreen></iframe></body></html>`;
}
