function validateShopLocation(
  { latitude, longitude, locality },
  required = true,
) {
  const hasCoordinates = latitude !== undefined || longitude !== undefined;
  if (required || hasCoordinates) {
    if (
      typeof latitude !== "number" ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    )
      return { error: "latitude must be a number between -90 and 90" };
    if (
      typeof longitude !== "number" ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    )
      return { error: "longitude must be a number between -180 and 180" };
  }
  if (
    locality !== undefined &&
    locality !== null &&
    typeof locality !== "string"
  )
    return { error: "locality must be a string" };
  const label = typeof locality === "string" ? locality.trim() : locality;
  if (typeof label === "string" && label.length > 120)
    return { error: "locality must be at most 120 characters" };
  return {
    location: hasCoordinates
      ? { type: "Point", coordinates: [longitude, latitude] }
      : undefined,
    locality: label,
  };
}

module.exports = { validateShopLocation };
