const MAP_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.in",
  "www.google.co.in",
  "maps.google.co.in",
  "maps.app.goo.gl",
  "goo.gl",
]);

function googleMapsUrl(raw) {
  if (typeof raw !== "string" || raw.length > 12000)
    throw new Error("Paste your shop’s Google Maps share link.");
  const embed = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  let url;
  try {
    url = new URL((embed ? embed[1].replaceAll("&amp;", "&") : raw).trim());
  } catch {
    throw new Error("That isn't a valid Google Maps link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !MAP_HOSTS.has(url.hostname)
  )
    throw new Error("Use a secure Google Maps link copied from Share.");
  const short =
    url.hostname === "maps.app.goo.gl" ||
    (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"));
  if (
    !short &&
    !(url.hostname.startsWith("maps.google.") && url.pathname === "/") &&
    !/^\/maps(?:\/|$)/.test(url.pathname)
  )
    throw new Error("This Google link doesn't point to a map.");
  if (url.searchParams.has("key"))
    throw new Error("Use your shop’s free Google Maps Share link.");
  return { url, short };
}

function mapDetails(raw) {
  const { url, short } = googleMapsUrl(raw);
  if (short)
    throw new Error("The short Google Maps link needs to be expanded first.");
  let decoded;
  try {
    decoded = decodeURIComponent(url.toString());
  } catch {
    throw new Error("The Google Maps link contains invalid characters.");
  }
  const query =
    url.searchParams.get("query") || url.searchParams.get("q") || "";
  const pin =
    decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) ||
    query.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  const coordinates = pin ? [Number(pin[2]), Number(pin[1])] : null;
  if (
    coordinates &&
    (Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90)
  )
    throw new Error("The Google Maps pin has invalid coordinates.");
  const place =
    decoded.match(/\/place\/([^/]+)/)?.[1]?.replaceAll("+", " ") || query;
  const cidHex = decoded.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i)?.[1];
  const cid = /^\d+$/.test(url.searchParams.get("cid") || "")
    ? url.searchParams.get("cid")
    : cidHex
      ? BigInt(cidHex).toString()
      : null;
  let embedUrl;
  if (url.pathname === "/maps/embed" && url.searchParams.has("pb"))
    embedUrl = url.toString();
  else {
    const preview = new URL("https://www.google.com/maps");
    if (cid) preview.searchParams.set("cid", cid);
    else if (url.searchParams.get("query_place_id"))
      preview.searchParams.set(
        "q",
        "place_id:" + url.searchParams.get("query_place_id"),
      );
    else if (pin) preview.searchParams.set("q", `${pin[1]},${pin[2]}`);
    else if (place) preview.searchParams.set("q", place);
    else throw new Error("Use your shop’s Google Maps Share link.");
    preview.searchParams.set("output", "embed");
    embedUrl = preview.toString();
  }
  return {
    google_maps_url: url.toString(),
    google_maps_embed_url: embedUrl,
    latitude: coordinates?.[1],
    longitude: coordinates?.[0],
    label: place || "Google Maps location",
    address: !pin && query.includes(",") ? query : "",
  };
}

async function resolveGoogleMapsLink(raw) {
  let current = googleMapsUrl(raw);
  for (let i = 0; current.short && i < 4; i++) {
    const response = await fetch(current.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Paprout/1.0" },
    });
    response.body?.cancel().catch(() => {});
    const redirect = response.headers.get("location");
    if (!redirect || response.status < 300 || response.status >= 400)
      throw new Error(
        "Couldn't open this short link. Open it in Google Maps and copy the full link from your browser.",
      );
    current = googleMapsUrl(new URL(redirect, current.url).toString());
  }
  return mapDetails(current.url.toString());
}

function validGoogleMapsUrl(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || /[<>]/.test(value)) return false;
  try {
    googleMapsUrl(value);
    return true;
  } catch {
    return false;
  }
}
function validGoogleMapsEmbedUrl(value) {
  if (value === undefined || value === null || value === "") return true;
  if (!validGoogleMapsUrl(value)) return false;
  try {
    const { url, short } = googleMapsUrl(value);
    return (
      !short &&
      (url.pathname === "/maps/embed" ||
        url.searchParams.get("output") === "embed")
    );
  } catch {
    return false;
  }
}
module.exports = {
  googleMapsUrl,
  mapDetails,
  resolveGoogleMapsLink,
  validGoogleMapsUrl,
  validGoogleMapsEmbedUrl,
};
