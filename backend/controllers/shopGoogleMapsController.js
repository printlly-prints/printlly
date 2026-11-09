const { resolveGoogleMapsLink } = require("../utils/googleMapsLink");
async function previewGoogleMaps(req, res) {
  try {
    return res.json(await resolveGoogleMapsLink(req.body?.url));
  } catch (error) {
    return res
      .status(400)
      .json({
        message:
          error.name === "TimeoutError"
            ? "Google's short-link lookup timed out. Retry or paste the full link."
            : error.message,
      });
  }
}
module.exports = { previewGoogleMaps };
