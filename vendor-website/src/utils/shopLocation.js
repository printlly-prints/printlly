export function parseCoordinates(latitude, longitude) {
  if (
    String(latitude ?? "").trim() === "" ||
    String(longitude ?? "").trim() === ""
  )
    return null;
  const lat = Number(latitude),
    lng = Number(longitude);
  return Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
    ? { lat, lng }
    : null;
}

export function initialLocation(shop) {
  const [lng, lat] = shop?.location?.coordinates || [];
  return {
    latitude: lat === undefined ? "" : String(lat),
    longitude: lng === undefined ? "" : String(lng),
    google_maps_url:
      shop?.google_maps_url ||
      (lat !== undefined
        ? "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng
        : ""),
    google_maps_embed_url:
      shop?.google_maps_embed_url ||
      (lat !== undefined
        ? "https://www.google.com/maps?q=" + lat + "," + lng + "&output=embed"
        : ""),
    locality: shop?.locality || "",
    address: shop?.address || "",
  };
}
