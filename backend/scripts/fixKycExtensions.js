/**
 * scripts/fixKycExtensions.js
 *
 *   node scripts/fixKycExtensions.js
 *
 * One-off repair for KYC documents uploaded before submitKyc started
 * putting a file extension on the Cloudinary public_id.
 *
 * Cloudinary decides a raw asset's Content-Type from the format it
 * recorded at upload time. Uploaded without an extension, it stores no
 * format and serves application/octet-stream - so the admin panel's "View
 * document (PDF)" link made the browser download an unnamed binary instead
 * of opening the PDF. That is what "the KYC PDF can't be viewed" was.
 *
 * Renaming is NOT enough: it leaves the stored format empty. This
 * downloads the existing bytes through a signed URL, re-uploads them under
 * a public_id ending in .pdf, points the Shop document at the new asset
 * and only then deletes the old one. The vendor never has to resubmit.
 * Images are skipped - Cloudinary tracks their format itself, so they were
 * never affected.
 *
 * Safe to re-run: assets Cloudinary already reports as format "pdf" are
 * skipped.
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Shop = require("../models/Shop");
const { getSignedKycUrl } = require("../utils/kycFileAccess");

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) =>
      error ? reject(error) : resolve(result)
    );
    stream.end(buffer);
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const shops = await Shop.find({
    "kyc.id_proof_url": { $exists: true, $ne: null },
    "kyc.id_proof_resource_type": "raw",
  }).select("shop_name kyc");

  let fixed = 0;
  let skipped = 0;

  for (const shop of shops) {
    const currentId = shop.kyc.id_proof_url;

    // Cloudinary reporting format "pdf" is the real signal - a public_id
    // that merely ends in .pdf can still be a renamed legacy asset with no
    // stored format, which is exactly the broken case.
    let stored;
    try {
      stored = await cloudinary.api.resource(currentId, { resource_type: "raw", type: "authenticated" });
    } catch (error) {
      console.error(`${shop.shop_name}: could not read ${currentId} (${error.error?.message || error.message}) - skipped`);
      continue;
    }

    if ((stored.format || "").toLowerCase() === "pdf") {
      skipped += 1;
      continue;
    }

    const folder = currentId.includes("/") ? currentId.slice(0, currentId.lastIndexOf("/")) : "shop_kyc";
    const nextId = `${folder}/kyc-${randomUUID()}.pdf`;

    try {
      const response = await fetch(getSignedKycUrl(shop, { expiresInSeconds: 120 }));
      if (!response.ok) throw new Error(`download failed with status ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());

      await uploadBuffer(buffer, { resource_type: "raw", type: "authenticated", public_id: nextId });

      shop.kyc.id_proof_url = nextId;
      await shop.save();

      // Only after the new asset is stored and referenced - a failure
      // above leaves the original in place and still reachable.
      await cloudinary.uploader.destroy(currentId, { resource_type: "raw", type: "authenticated" });

      fixed += 1;
      console.log(`${shop.shop_name}: ${currentId} -> ${nextId} (${buffer.length} bytes)`);
    } catch (error) {
      console.error(`${shop.shop_name}: repair failed (${error.message || error.error?.message}) - left as is`);
    }
  }

  console.log(`\nDone. Repaired ${fixed}, already correct ${skipped}, total raw KYC docs ${shops.length}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("fixKycExtensions failed:", err.message);
  process.exit(1);
});
