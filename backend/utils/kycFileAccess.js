const cloudinary = require("../config/cloudinary");

// Generates a signed, time-limited URL for a shop's KYC id proof - the
// ONLY way that file is ever meant to become viewable. See
// models/Shop.js's kyc schema comment and POST /shops/me/kyc in
// shopController.js for why the file itself is uploaded with
// type: "authenticated" and no URL is ever persisted or returned.
//
// Nothing in this codebase calls this yet - there is no admin review
// screen in this pass, by design (see the task this was written for).
// It exists now because the identifier + resource type are persisted
// specifically so a future screen can produce a working link without
// any schema change when it's built - not because anything needs it
// today.
//
// expiresInSeconds defaults to 5 minutes: long enough for a human
// reviewer to open the link, short enough that a leaked link (a support
// ticket, a chat log, a browser history entry) stops working quickly.
function getSignedKycUrl(shop, { expiresInSeconds = 300 } = {}) {
  if (!shop?.kyc?.id_proof_url) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return cloudinary.utils.private_download_url(shop.kyc.id_proof_url, undefined, {
    resource_type: shop.kyc.id_proof_resource_type || "image",
    type: "authenticated",
    expires_at: expiresAt,
  });
}

module.exports = { getSignedKycUrl };
