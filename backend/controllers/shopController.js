const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const Shop = require("../models/Shop");
const cloudinary = require("../config/cloudinary");
const { getShopQueueInfo, getQueueInfoForShops } = require("../utils/queue");
const { getPricingSettings, computeOrderPricing } = require("../utils/pricing");
const { normalizeDocumentList } = require("../utils/orderDocuments");
const {
  normalizeServiceName,
  findServiceByFuzzyName,
  resolveDocumentServices,
} = require("../utils/shopServices");
const { computeShopAvailability, toPublicShop, AVAILABILITY_FIELDS } = require("../utils/shopStatus");
const PayoutHistory = require("../models/PayoutHistory");
const Settlement = require("../models/Settlement");
const Order = require("../models/Order");
const { SETTLEABLE, round2 } = require("../utils/settlement");
const { buildSearchFilter, parseGeoPoint, findListedShops, distanceKmTo } = require("../utils/shopSearch");
const { trackEvent, EVENTS } = require("../utils/analytics");

const { validateShopLocation } = require("../utils/shopLocation");
const maps = require("../utils/googleMapsLink");
const { localShopPhotosEnabled, saveLocalShopPhoto, removeLocalShopPhoto } = require('../utils/localShopPhotos');
// Mirrors the cap enforced on the Shop schema itself - checked here too so
// a vendor gets a clear message rather than a validation error.
const MAX_SERVICES_PER_SHOP = 20;
const MAX_SERVICE_NAME_LENGTH = 60;

// Shared by the add and update service routes. Returns { name, rate } with
// the cleaned values, or { error }. Fields are only validated when sent -
// PATCH is a partial update.
function validateServiceInput({ name, rate, enabled }, { nameRequired, rateRequired }) {
  let cleanName;
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return { error: "name is required and must be a non-empty string" };
    }
    cleanName = name.trim();
    if (cleanName.length > MAX_SERVICE_NAME_LENGTH) {
      return { error: `name must be ${MAX_SERVICE_NAME_LENGTH} characters or fewer` };
    }
  } else if (nameRequired) {
    return { error: "name is required" };
  }

  if (rate !== undefined) {
    if (!isNonNegativeNumber(rate)) {
      return { error: "rate must be a number >= 0" };
    }
  } else if (rateRequired) {
    return { error: "rate is required" };
  }

  if (enabled !== undefined && typeof enabled !== "boolean") {
    return { error: "enabled must be a boolean" };
  }

  return { name: cleanName, rate };
}

// Customers order by NAME (see utils/shopServices.js), so two services
// whose names differ only by case or spacing are indistinguishable to
// them - and one of the two could never be bought. `exceptId` lets an
// update skip the service being edited.
function findDuplicateServiceName(services, name, exceptId) {
  const target = normalizeServiceName(name);
  return services.find(
    (s) => normalizeServiceName(s.name) === target && (!exceptId || !s._id.equals(exceptId))
  );
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Incoming transformation applied to the two PUBLIC shop photos as they
// are uploaded, so what Cloudinary stores (and therefore what every
// customer downloads on every shop card, forever) is a sensibly-sized
// image rather than whatever a modern phone camera produced - a 4000px,
// multi-megabyte original being served into a 110px-tall card.
//
// crop: "limit" only ever scales DOWN and preserves aspect ratio: a photo
// already smaller than this is stored untouched, never upscaled or
// cropped. quality: "auto" lets Cloudinary pick a visually-lossless
// compression level per image.
//
// Deliberately NOT applied to the KYC id proof (submitKyc below): that is
// a government ID a human reviewer has to read, so it must stay exactly
// as submitted - and it can be a PDF, which isn't a transformable image
// resource in the first place.
const PHOTO_TRANSFORMATION = {
  transformation: [{ width: 1024, height: 1024, crop: "limit", quality: "auto" }],
};

// Wraps Cloudinary's upload_stream callback API in a Promise - same
// pattern uploadController.js already uses for print documents, reused
// here for shop/owner photos and the KYC id proof.
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) =>
      error ? reject(error) : resolve(result)
    );
    stream.end(buffer);
  });
}

// Shared by both POST /shops/me/* routes: loads the shop belonging to
// the logged-in shop owner, or sends a 404 and returns null. Same shape
// as orderController.js's loadOwnedOrder.
async function loadMyShop(req, res) {
  const shop = await Shop.findOne({ owner_id: req.user.id });
  if (!shop) {
    res.status(404).json({ message: "No shop registered yet. Register your shop before uploading photos or KYC documents." });
    return null;
  }
  return shop;
}

// POST /shops
// Lets a logged-in shop_owner register their print shop.
//
// pricing is prefilled from the current global Settings document - a
// sensible starting point rather than zeros - but from this point on it
// belongs entirely to this shop: PATCH /shops/me/pricing edits only this
// document, never Settings, and a later change to Settings has no effect
// on any shop already created. Only rate_per_page_bw/color,
// paper_size_rates and sides_extra_rate are copied over; every
// shop starts with NO finishing services at all (see the schema comment
// in models/Shop.js) regardless of Settings' own service_rates - services
// are vendor-defined free text now, so there is nothing generic to seed.
const createShop = async (req, res) => {
  try {
    const { shop_name, address, contact } = req.body;

    if ([shop_name, address, contact].some((value) => typeof value !== "string" || !value.trim())) {
      return res.status(400).json({ message: "shop_name, address and contact are required" });
    }
    const pin = validateShopLocation(req.body, false);
    if ((!maps.validGoogleMapsUrl(req.body.google_maps_url) || !maps.validGoogleMapsEmbedUrl(req.body.google_maps_embed_url))) return res.status(400).json({ message: "Invalid Google Maps link" });
    if (pin.error) return res.status(400).json({ message: pin.error });

    // One shop per owner. Checked explicitly here (rather than relying
    // on the schema's unique index on owner_id alone) so a second
    // registration attempt gets a clear 409 with a real message instead
    // of a raw Mongo E11000 duplicate-key error - the index is still
    // what actually prevents it under a race (e.g. a double-submit),
    // this check is just for the common, non-racy case.
    const existingShop = await Shop.findOne({ owner_id: req.user.id });
    if (existingShop) {
      return res.status(409).json({ message: "You already have a registered shop" });
    }

    const settings = await getPricingSettings();

    const shop = await Shop.create({
      owner_id: req.user.id,
      shop_name: shop_name.trim(),
      address: address.trim(),
      contact: contact.trim(),
      location: pin.location,
      google_maps_url: req.body.google_maps_url,
      google_maps_embed_url: req.body.google_maps_embed_url,
      locality: pin.locality,
      pricing: {
        rate_per_page_bw: settings.rate_per_page_bw,
        rate_per_page_color: settings.rate_per_page_color,
        paper_size_rates: {
          A4: settings.paper_size_rates.A4,
          A3: settings.paper_size_rates.A3,
        },
        sides_extra_rate: settings.sides_extra_rate,
        // services intentionally omitted - a new shop starts with an
        // EMPTY list (schema default) and the vendor adds whatever they
        // actually offer, with their own names and prices.
      },
    });

    res.status(201).json(shop);
  } catch (error) {
    // Fallback for the race the explicit check above can't catch (e.g.
    // two near-simultaneous requests both passing the findOne check
    // before either's create() commits) - the unique index on owner_id
    // is what actually stops the second write, surfaced here as the
    // same clear 409 rather than a raw 500.
    if (error.code === 11000) {
      return res.status(409).json({ message: "You already have a registered shop" });
    }
    console.error(`Failed to create shop: ${error.message}`);
    res.status(500).json({ message: "Failed to create shop" });
  }
};

// GET /shops
// Public listing of shops customers can actually order from: active AND
// verified. A pending or rejected shop is invisible here no matter what -
// there's no "preview your own unapproved shop" path through this
// endpoint (the vendor sees their own shop's real status via GET
// /shops/me instead). The is_active half of that filter is also how a
// deactivated shop (PATCH /shops/me/deactivate or the admin equivalent)
// disappears from here - confirmed by e2eTest.js's shopDeactivation
// section, not just assumed from the query shape. Each shop carries its
// live queue info inline (see
// utils/queue.js) so the app can show a rush indicator per shop without
// a separate request per shop (N+1) - one batched aggregation covers
// every shop in the list.
//
// The .select() is an INCLUSION list (only these fields), not the
// exclusion list this used to use, so sensitive vendor data is never
// read out of the database at all rather than being loaded and then
// stripped in JS: kyc especially (see models/Shop.js), plus
// owner_photo_url/verification_status/rejection_reason, which are
// vendor/admin-facing only. shop_photo_url is the one photo customers
// are meant to see, so it stays.
//
// It also drops `pricing` from the payload, which no customer-facing
// client reads from this route (per-shop prices reach the app already
// applied to a specific order, via POST /shops/compare-pricing) - a
// nested object per shop, on every listing, that nothing consumed.
//
// The availability fields ARE selected (shop_status/is_currently_open
// can't be computed without them) but never sent - toPublicShop strips
// the raw inputs right after computing, so a customer gets the computed
// answer and never the fields behind it, and nothing downstream is
// tempted to re-derive it and get a different answer. Neither a closed
// NOR a busy shop is excluded from this list: a busy shop is fully
// orderable, and a closed one can still be browsed or saved for later.
//
// No .lean(): this collection still holds documents predating is_open/
// business_hours/pricing, and Mongoose's schema defaults are what make
// those read back sensibly (see models/Shop.js's own comment on exactly
// that). .lean() skips default backfilling, so a legacy shop would come
// back with is_open undefined and be reported permanently closed. The
// hydration cost is worth correctness here; the .select() above is where
// the real saving comes from either way.
//
// Optional query params (independent, combinable):
//   ?search=<text>      case-insensitive match on shop_name/address/locality
//   ?lat=<n>&lng=<n>    sort nearest first and add distance_km per shop
//                       (null for shops with no location, listed last)
// Without lat/lng the order is unchanged and no distance_km is sent. See
// utils/shopSearch.js, shared with POST /shops/compare-pricing.
const getActiveShops = async (req, res) => {
  try {
    const { point, error } = parseGeoPoint(req.query.lat, req.query.lng);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const entries = await findListedShops({
      filter: { is_active: true, verification_status: "approved", ...buildSearchFilter(req.query.search) },
      select: `shop_name address contact shop_photo_url locality location ${AVAILABILITY_FIELDS}`,
      point,
    });

    const queueByShopId = await getQueueInfoForShops(entries.map(({ shop }) => shop._id));

    // .toObject() first: a Mongoose document only serializes its schema
    // paths, so setting `.queue` directly on the document instance would
    // silently be dropped by res.json() instead of appearing in the
    // response.
    const shopsWithQueue = entries.map(({ shop, distance_km }) => {
      const plain = toPublicShop(shop.toObject());
      plain.queue = queueByShopId.get(shop._id.toString());
      if (point) plain.distance_km = distance_km;
      return plain;
    });

    res.status(200).json(shopsWithQueue);
  } catch (error) {
    console.error(`Failed to fetch shops: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch shops" });
  }
};

// GET /shops/:shopId/queue
// Public - no auth, deliberately: a customer should be able to see how
// busy a shop looks while just browsing, before they've even logged in.
// Same counting/threshold logic as the inline queue info on GET /shops
// (see utils/queue.js) - this just exposes it for one shop on its own,
// e.g. for a shop detail screen.
//
// Gated on the same is_active + verification_status "approved" pair as
// GET /shops, and for the same reason: a customer can only ever have
// discovered this shopId through that listing, so a shop that's since
// gone inactive or lost its approval should be exactly as invisible
// here as it now is there - not leak its queue data to whoever still
// has the old id.
const getShopQueue = async (req, res) => {
  try {
    const { shopId } = req.params;

    // Only the two gate flags are needed - this never reads the shop's
    // pricing, photos or kyc, so there's no reason to pull the whole
    // document (including that kyc sub-object) into memory to answer a
    // queue count.
    const shop = await Shop.findById(shopId).select("is_active verification_status");
    if (!shop || !shop.is_active || shop.verification_status !== "approved") {
      return res.status(404).json({ message: "Shop not found" });
    }

    const queue = await getShopQueueInfo(shop._id);
    res.status(200).json(queue);
  } catch (error) {
    console.error(`Failed to fetch shop queue: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch shop queue" });
  }
};

// GET /shops/me
// Returns the shop belonging to the logged-in shop owner, or a 404 with a
// clear message if they haven't registered one yet. The frontend uses
// that 404 to decide whether to show the shop setup form, and otherwise
// reads verification_status/rejection_reason to show "Pending
// verification" / "Rejected: <reason>" / a fully active dashboard.
//
// Full shop data, with ONE deliberate exception: kyc.id_proof_url and
// id_proof_resource_type are stripped even here. That file must never
// reach any client - "including the vendor's own app" is explicit in
// how this was specified - so that rule wins even though this route is
// otherwise meant to return everything. The rest of kyc (id_proof_type,
// gst_number) is harmless for the vendor to see back and stays.
const getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner_id: req.user.id });
    if (!shop) {
      return res.status(404).json({ message: "No shop registered yet" });
    }

    const plain = shop.toObject();
    if (plain.kyc) {
      delete plain.kyc.id_proof_url;
      delete plain.kyc.id_proof_resource_type;
    }

    // The vendor gets the raw fields (this is their own shop - they need
    // busy_until to render "busy until 11:30") AND the same computed
    // answer their customers are seeing, under the same name. Without
    // it the dashboard would have to re-implement the expiry and
    // business-hours rules in the browser and could disagree with the
    // server about what the shop is currently doing.
    const { status, prep_minutes } = computeShopAvailability(plain);
    plain.effective_status = status;
    plain.effective_prep_minutes = prep_minutes;

    res.status(200).json(plain);
  } catch (error) {
    console.error(`Failed to fetch shop: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch shop" });
  }
};

// POST /shops/me/photos
// Shop owner uploads their own photo and/or a photo of the shopfront -
// either field alone is fine, so a vendor can update just one later
// without resending the other. Both are ordinary public Cloudinary
// uploads (resource_type "image", default public delivery type) - these
// are meant to be shown on customer-facing shop cards, unlike the KYC
// upload below.
const uploadShopPhotos = async (req, res) => {
  const local = localShopPhotosEnabled();
  const origin = `${req.protocol}://${req.get('host')}`;
  const savedLocalPhotos = [];
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const ownerPhotoFile = req.files?.owner_photo?.[0];
    const shopPhotoFile = req.files?.shop_photo?.[0];

    if (!ownerPhotoFile && !shopPhotoFile) {
      return res.status(400).json({
        message: "Send at least one of 'owner_photo' or 'shop_photo'.",
      });
    }

    const previousOwnerPhoto = shop.owner_photo_url;
    const previousShopPhoto = shop.shop_photo_url;
    if (local) {
      for (const [file, field] of [[ownerPhotoFile,'owner_photo_url'], [shopPhotoFile,'shop_photo_url']]) {
        if (!file) continue;
        shop[field] = await saveLocalShopPhoto(file, origin);
        savedLocalPhotos.push(shop[field]);
      }
    } else {
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
        return res.status(503).json({ message: 'Photo storage is unavailable. Please try again later.' });
      if (ownerPhotoFile) {
        const result = await uploadToCloudinary(ownerPhotoFile.buffer, {
          resource_type: "image",
          folder: "shop_photos",
          ...PHOTO_TRANSFORMATION,
        });
        shop.owner_photo_url = result.secure_url;
      }

      if (shopPhotoFile) {
        const result = await uploadToCloudinary(shopPhotoFile.buffer, {
          resource_type: "image",
          folder: "shop_photos",
          ...PHOTO_TRANSFORMATION,
        });
        shop.shop_photo_url = result.secure_url;
      }
    }

    await shop.save();
    if (local) {
      if (ownerPhotoFile) await removeLocalShopPhoto(previousOwnerPhoto, origin);
      if (shopPhotoFile) await removeLocalShopPhoto(previousShopPhoto, origin);
    }

    res.status(200).json({
      owner_photo_url: shop.owner_photo_url,
      shop_photo_url: shop.shop_photo_url,
    });
  } catch (error) {
    await Promise.all(savedLocalPhotos.map(url=>removeLocalShopPhoto(url,origin)));
    console.error(`Failed to upload shop photos: ${error.message}`);
    res.status(error.status || 500).json({ message: error.status === 400 ? error.message : 'Failed to upload shop photos. Please try again.' });
  }
};

// Why a KYC submission is being refused, or null when it's allowed.
//
// "pending" alone is NOT enough to refuse: a brand-new shop starts at
// "pending" with nothing submitted, and that first submission has to get
// through. What's actually locked is a decision being outstanding on a
// document that EXISTS (id_proof_url set), or one already made:
//   - pending + a submitted document -> under review, wait for a decision
//   - approved                       -> done, nothing to resubmit
//   - rejected, or nothing submitted -> allowed (this is the resubmission
//                                       path the route exists for)
function kycLockReason(shop) {
  if (shop.verification_status === "approved") {
    return "Your shop is already verified — contact support if you need to update your documents.";
  }
  if (shop.verification_status === "pending" && shop.kyc?.id_proof_url) {
    return "Your KYC is already under review — please wait for a decision before resubmitting.";
  }
  return null;
}

// Cloudinary serves a raw asset by the extension on its public_id. Without
// one it answers application/octet-stream, which makes a browser download
// an unnamed binary instead of previewing the PDF - that was the whole
// "KYC document won't open in the admin panel" bug. Images don't need this
// (Cloudinary tracks their format itself).
const KYC_EXTENSIONS = { "application/pdf": ".pdf" };

// POST /shops/me/kyc
// Shop owner submits (or resubmits, after a rejection) their identity
// verification. gst_number is OPTIONAL - a shop below the GST threshold
// is normal - so it is never validated or required here. The id proof file is uploaded with type: "authenticated"
// - Cloudinary will refuse to deliver it at all without a freshly signed,
// time-limited URL (see utils/kycFileAccess.js) - and only its Cloudinary
// public_id is ever persisted, never a working URL. The response below
// deliberately echoes back nothing about the file itself: not its
// public_id, not a URL, nothing - a client (including the vendor's own
// app that just uploaded it) has no legitimate reason to receive that
// back, only a human reviewer using a future admin screen ever will.
const submitKyc = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const { id_proof_type, gst_number } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Send the id proof file under the field name 'id_proof'." });
    }
    if (!["aadhaar", "pan", "other"].includes(id_proof_type)) {
      return res.status(400).json({ message: "id_proof_type must be 'aadhaar', 'pan' or 'other'" });
    }

    const lockedMessage = kycLockReason(shop);
    if (lockedMessage) {
      return res.status(400).json({ message: lockedMessage });
    }

    // The id proof can legitimately be a photo of a card or a scanned
    // PDF - multer's fileFilter (shopRoutes.js) already limited this to
    // JPG/PNG/PDF, so mimetype alone is enough to pick the right
    // Cloudinary resource type.
    const resourceType = file.mimetype === "application/pdf" ? "raw" : "image";

    // The extension has to be part of the public_id for a raw asset - see
    // KYC_EXTENSIONS above. randomUUID keeps it unguessable, which matters
    // for a government ID even though delivery is already authenticated.
    const extension = KYC_EXTENSIONS[file.mimetype] || "";
    const result = await uploadToCloudinary(file.buffer, {
      resource_type: resourceType,
      type: "authenticated",
      folder: "shop_kyc",
      ...(extension ? { public_id: `kyc-${randomUUID()}${extension}` } : {}),
    });

    shop.kyc = {
      id_proof_type,
      id_proof_url: result.public_id,
      id_proof_resource_type: resourceType,
      gst_number: gst_number || undefined,
    };
    // Resubmitting after a rejection goes back to "pending" for
    // re-review, and any old rejection reason no longer applies.
    shop.verification_status = "pending";
    shop.rejection_reason = null;
    await shop.save();

    res.status(200).json({
      message: "KYC documents submitted for review.",
      verification_status: shop.verification_status,
    });
  } catch (error) {
    console.error(`Failed to submit KYC: ${error.message}`);
    res.status(500).json({ message: "Failed to submit KYC" });
  }
};

// GET /shops/me/pricing
// The logged-in shop owner's own pricing - everything they can charge for
// except the platform_fee, which is global and never exposed on this
// route (see models/Shop.js's pricing schema comment).
const getMyPricing = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    res.status(200).json(shop.pricing);
  } catch (error) {
    console.error(`Failed to fetch pricing: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch pricing" });
  }
};

// PATCH /shops/me/pricing
// Lets a shop owner set their own prices. This is a partial update, same
// spirit as PATCH elsewhere in this codebase - any field left out of the
// body (at any depth: a whole top-level field, or just one paper size, or
// just one service's `enabled`/`rate`) is left exactly as it was, so a
// vendor can tweak one number without resending the entire object.
//
// Every numeric field is validated here even though the schema also
// carries min/max (models/Shop.js) - that schema-level check is only a
// safety net; this is what actually produces the clear 400 messages the
// task asked for instead of a raw Mongoose ValidationError.
const updateMyPricing = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const { rate_per_page_bw, rate_per_page_color, paper_size_rates, sides_extra_rate, services } = req.body;

    if (rate_per_page_bw !== undefined) {
      if (!isNonNegativeNumber(rate_per_page_bw)) {
        return res.status(400).json({ message: "rate_per_page_bw must be a number >= 0" });
      }
      shop.pricing.rate_per_page_bw = rate_per_page_bw;
    }

    if (rate_per_page_color !== undefined) {
      if (!isNonNegativeNumber(rate_per_page_color)) {
        return res.status(400).json({ message: "rate_per_page_color must be a number >= 0" });
      }
      shop.pricing.rate_per_page_color = rate_per_page_color;
    }

    if (paper_size_rates !== undefined) {
      if (typeof paper_size_rates !== "object" || paper_size_rates === null) {
        return res.status(400).json({ message: "paper_size_rates must be an object" });
      }
      if (paper_size_rates.A4 !== undefined) {
        if (!isNonNegativeNumber(paper_size_rates.A4)) {
          return res.status(400).json({ message: "paper_size_rates.A4 must be a number >= 0" });
        }
        shop.pricing.paper_size_rates.A4 = paper_size_rates.A4;
      }
      if (paper_size_rates.A3 !== undefined) {
        if (!isNonNegativeNumber(paper_size_rates.A3)) {
          return res.status(400).json({ message: "paper_size_rates.A3 must be a number >= 0" });
        }
        shop.pricing.paper_size_rates.A3 = paper_size_rates.A3;
      }
    }

    // A flat rupee amount per page now, not a percentage - so it is
    // validated exactly like the paper size rates above, with no upper
    // bound. The old 0-100 ceiling was meaningful for a percentage and
    // would be arbitrary for a price.
    if (sides_extra_rate !== undefined) {
      if (!isNonNegativeNumber(sides_extra_rate)) {
        return res.status(400).json({ message: "sides_extra_rate must be a number >= 0" });
      }
      shop.pricing.sides_extra_rate = sides_extra_rate;
    }

    // The old percentage field, rejected explicitly rather than ignored:
    // a client still sending it would otherwise get a 200 and assume its
    // duplex pricing had been saved when nothing had changed.
    if (req.body.sides_surcharge_percent !== undefined) {
      return res.status(400).json({
        message:
          "sides_surcharge_percent no longer exists - set sides_extra_rate, a flat amount per page for double-sided.",
      });
    }

    // Services are NOT editable here any more: they are a vendor-defined
    // list with their own add/update/delete routes below, not a fixed set
    // of three keys that could be patched wholesale. Rejected explicitly
    // rather than ignored, so a client sending the old shape finds out.
    if (services !== undefined) {
      return res.status(400).json({
        message:
          "Services are managed individually now - use POST/PATCH/DELETE /shops/me/pricing/services.",
      });
    }

    await shop.save();
    res.status(200).json(shop.pricing);

    // A vendor keeping their rates current is the clearest signal that a
    // shop is actively managed rather than dormant, which is a question the
    // product genuinely has about its supply side.
    //
    // Only that it happened, and for which shop - not the rates themselves.
    // A shop's price list is its commercial position, and shipping it to an
    // analytics vendor is not something a pricing screen should quietly do.
    trackEvent({
      event: EVENTS.PRICING_UPDATED,
      userId: req.user.id,
      properties: { shop_id: String(shop._id), role: "shop_owner", source: "backend" },
    });
  } catch (error) {
    console.error(`Failed to update pricing: ${error.message}`);
    res.status(500).json({ message: "Failed to update pricing" });
  }
};

// POST /shops/me/pricing/services
// Adds one service to this shop's own list. Body: { name, rate, enabled }.
//
// Services are vendor-defined free text: a shop lists what it actually
// offers ("Matte Lamination", "Hole Punching", "Perfect Binding"), rather
// than picking from a fixed set. Customers match against these names (see
// utils/shopServices.js), so the name a vendor types here is the name a
// customer will see and order by.
const addMyService = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const { name, rate, enabled } = req.body;

    const validation = validateServiceInput({ name, rate, enabled }, { nameRequired: true, rateRequired: true });
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    if (shop.pricing.services.length >= MAX_SERVICES_PER_SHOP) {
      return res.status(400).json({
        message: `A shop can list at most ${MAX_SERVICES_PER_SHOP} services. Remove one before adding another.`,
      });
    }

    // Two services with the same name would be indistinguishable to a
    // customer ordering by name - and POST /orders matches by name, so
    // one of them could never be bought.
    if (findDuplicateServiceName(shop.pricing.services, validation.name)) {
      return res.status(409).json({ message: `You already offer a service called "${validation.name}".` });
    }

    shop.pricing.services.push({
      name: validation.name,
      rate: validation.rate,
      enabled: enabled === undefined ? true : enabled,
    });
    await shop.save();

    // The whole list back, not just the new entry: the dashboard renders
    // the list, and this saves it a follow-up GET.
    res.status(201).json(shop.pricing.services);
  } catch (error) {
    console.error(`Failed to add service: ${error.message}`);
    res.status(500).json({ message: "Failed to add service" });
  }
};

// PATCH /shops/me/pricing/services/:serviceId
// Partial update of one service - name, rate and/or enabled.
//
// Renaming or re-pricing does NOT affect orders already placed: each order
// snapshots the name and rate it was sold at (see Order.documents[].services),
// precisely so a vendor can adjust their list without rewriting history.
const updateMyService = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const service = shop.pricing.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    const { name, rate, enabled } = req.body;
    if (name === undefined && rate === undefined && enabled === undefined) {
      return res.status(400).json({ message: "Send name, rate and/or enabled to update." });
    }

    const validation = validateServiceInput({ name, rate, enabled }, { nameRequired: false, rateRequired: false });
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    if (name !== undefined) {
      // Same-name check as add, excluding this service itself so saving a
      // service without changing its name isn't a conflict with itself.
      if (findDuplicateServiceName(shop.pricing.services, validation.name, service._id)) {
        return res.status(409).json({ message: `You already offer a service called "${validation.name}".` });
      }
      service.name = validation.name;
    }
    if (rate !== undefined) service.rate = validation.rate;
    if (enabled !== undefined) service.enabled = enabled;

    await shop.save();
    res.status(200).json(shop.pricing.services);
  } catch (error) {
    console.error(`Failed to update service: ${error.message}`);
    res.status(500).json({ message: "Failed to update service" });
  }
};

// DELETE /shops/me/pricing/services/:serviceId
// Removes a service from this shop's list.
//
// Always safe with respect to existing orders: an order stores a SNAPSHOT
// of each selected service's name and rate, not a live reference, so a
// past order keeps saying what was sold and what was charged even after
// the service itself is gone. Its service_id simply stops resolving,
// which is expected.
const deleteMyService = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const service = shop.pricing.services.id(req.params.serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    service.deleteOne();
    await shop.save();

    res.status(200).json(shop.pricing.services);
  } catch (error) {
    console.error(`Failed to delete service: ${error.message}`);
    res.status(500).json({ message: "Failed to delete service" });
  }
};

// PATCH /shops/me/status
// Lets a shop owner set how they're currently trading (shop_status:
// open/busy/closed, plus the Busy settings) and/or configure an automatic
// schedule (business_hours) - entirely separate from
// is_active/verification_status, which control whether the shop is listed
// at all (see models/Shop.js). Partial update, same spirit as PATCH
// /shops/me/pricing: either field alone is fine, and business_hours
// itself only touches whichever of open_time/close_time/enabled was
// actually sent.
//
// Busy is a trading state, not an order state: nothing here touches any
// order, and there is no "busy" order status. See utils/shopStatus.js.
//
// Body:
//   shop_status        "open" | "busy" | "closed"
//   busy_prep_minutes  what to tell customers to expect while busy
//                      (1-240). Ignored unless busy.
//   busy_for_minutes   how long Busy should last (1-1440), or null for
//                      "Until I turn it off" (the default). The SERVER
//                      turns this into busy_until, so a device with a
//                      wrong clock can't set an expiry in the past.
//   is_open            DEPRECATED boolean from older clients, translated
//                      to shop_status open/closed.
const updateMyStatus = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const { is_open, shop_status, busy_prep_minutes, busy_for_minutes, business_hours } = req.body;

    if (
      is_open === undefined &&
      shop_status === undefined &&
      busy_prep_minutes === undefined &&
      busy_for_minutes === undefined &&
      business_hours === undefined
    ) {
      return res
        .status(400)
        .json({ message: "Send shop_status and/or business_hours to update." });
    }

    // Translated, not stored: is_open is no longer read (see
    // models/Shop.js), so an old client saying is_open:false has to end
    // up as shop_status "closed" or it would have no effect at all.
    let nextStatus = shop_status;
    if (nextStatus === undefined && is_open !== undefined) {
      if (typeof is_open !== "boolean") {
        return res.status(400).json({ message: "is_open must be a boolean" });
      }
      nextStatus = is_open ? "open" : "closed";
    }

    if (nextStatus !== undefined) {
      if (!["open", "busy", "closed"].includes(nextStatus)) {
        return res.status(400).json({ message: 'shop_status must be "open", "busy" or "closed"' });
      }
      shop.shop_status = nextStatus;
    }

    const effectiveStatus = nextStatus ?? shop.shop_status;

    if (effectiveStatus === "busy") {
      if (busy_prep_minutes !== undefined) {
        if (!Number.isInteger(busy_prep_minutes) || busy_prep_minutes < 1 || busy_prep_minutes > 240) {
          return res
            .status(400)
            .json({ message: "busy_prep_minutes must be a whole number of minutes between 1 and 240" });
        }
        shop.busy_prep_minutes = busy_prep_minutes;
      }

      if (busy_for_minutes !== undefined) {
        if (busy_for_minutes === null) {
          // "Until I turn it off" - the default, and the only Busy that
          // never expires on its own.
          shop.busy_until = null;
        } else if (
          !Number.isInteger(busy_for_minutes) ||
          busy_for_minutes < 1 ||
          busy_for_minutes > 1440
        ) {
          return res
            .status(400)
            .json({ message: "busy_for_minutes must be a whole number of minutes between 1 and 1440, or null" });
        } else {
          shop.busy_until = new Date(Date.now() + busy_for_minutes * 60 * 1000);
        }
      }
    } else if (nextStatus !== undefined) {
      // Leaving Busy clears its settings outright. Leaving them behind
      // would mean the next Busy silently inherited a timer the vendor
      // set hours ago and has no reason to expect.
      shop.busy_until = null;
      shop.busy_prep_minutes = null;
    }

    if (business_hours !== undefined) {
      if (typeof business_hours !== "object" || business_hours === null) {
        return res.status(400).json({ message: "business_hours must be an object" });
      }

      const { open_time, close_time, enabled } = business_hours;

      if (open_time !== undefined) {
        if (typeof open_time !== "string" || !TIME_REGEX.test(open_time)) {
          return res.status(400).json({ message: "business_hours.open_time must be in 24-hour HH:MM format" });
        }
        shop.business_hours.open_time = open_time;
      }
      if (close_time !== undefined) {
        if (typeof close_time !== "string" || !TIME_REGEX.test(close_time)) {
          return res.status(400).json({ message: "business_hours.close_time must be in 24-hour HH:MM format" });
        }
        shop.business_hours.close_time = close_time;
      }
      if (enabled !== undefined) {
        if (typeof enabled !== "boolean") {
          return res.status(400).json({ message: "business_hours.enabled must be a boolean" });
        }
        shop.business_hours.enabled = enabled;
      }

      // A schedule can't be turned on without both times set (whether
      // already stored or sent in this same request) - otherwise
      // computeEffectiveOpenStatus would silently fall back to the
      // manual toggle, which wouldn't be obvious from this response.
      if (shop.business_hours.enabled && (!shop.business_hours.open_time || !shop.business_hours.close_time)) {
        return res.status(400).json({
          message: "business_hours.open_time and close_time are required to enable a schedule",
        });
      }
    }

    await shop.save();

    // The effective answer, not the stored choice: a schedule can close a
    // shop the vendor just set to Open, and the vendor should see that
    // here rather than discovering it from a customer.
    const { status, prep_minutes } = computeShopAvailability(shop);
    res.status(200).json({
      shop_status: shop.shop_status,
      busy_until: shop.busy_until,
      busy_prep_minutes: shop.busy_prep_minutes,
      business_hours: shop.business_hours,
      effective_status: status,
      effective_prep_minutes: prep_minutes,
      // DERIVED for older clients, never read back - the stored is_open
      // is no longer written and would be stale here (see models/Shop.js).
      is_open: status !== "closed",
    });
  } catch (error) {
    console.error(`Failed to update shop status: ${error.message}`);
    res.status(500).json({ message: "Failed to update shop status" });
  }
};

// PATCH /shops/me/location
// Shop owner pins their shop on the map and/or sets a searchable area
// label. Body: { latitude, longitude, locality }. latitude and longitude
// are required together (a half-set point is meaningless); locality is
// optional - send an empty string or null to clear it. Stored as a GeoJSON
// point, which is [longitude, latitude] order.
const updateMyLocation = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    if ((!maps.validGoogleMapsUrl(req.body.google_maps_url) || !maps.validGoogleMapsEmbedUrl(req.body.google_maps_embed_url))) return res.status(400).json({ message: "Invalid Google Maps link" });
    const pin = validateShopLocation(req.body, !req.body.google_maps_url);
    if (pin.error) return res.status(400).json({ message: pin.error });
    const { address } = req.body;
    if (address !== undefined && (typeof address !== "string" || !address.trim())) return res.status(400).json({ message: "address must be non-empty text" });
    shop.location = pin.location;
    if (req.body.google_maps_url !== undefined) shop.google_maps_url = req.body.google_maps_url;
    if (req.body.google_maps_embed_url !== undefined) shop.google_maps_embed_url = req.body.google_maps_embed_url;
    if (pin.locality !== undefined) shop.locality = pin.locality;
    if (address !== undefined) shop.address = address.trim();

    await shop.save();

    res.status(200).json({ location: shop.location, locality: shop.locality });
  } catch (error) {
    console.error(`Failed to update shop location: ${error.message}`);
    res.status(500).json({ message: "Failed to update shop location" });
  }
};

// PATCH /shops/me/deactivate
// Shop owner takes their shop off the platform entirely - a different,
// longer-term concept from is_open/business_hours above (PATCH
// /shops/me/status). is_open is a day-to-day "not accepting orders
// today/right now" toggle a vendor flips constantly and expects to flip
// back within hours; is_active means "this shop isn't operating on this
// platform at all any more" (shut down, owner moved on, or pulled by an
// admin for a policy violation - see deactivateShop below). getActiveShops,
// comparePricing and createOrder all gate on is_active FIRST, before
// is_open/verification_status even come into it (see each of their own
// comments) - so a deactivated shop disappears from every customer-facing
// surface no matter what is_open says, and simply toggling is_open back
// to true has no effect on that; only reactivateMyShop (or an admin)
// brings it back.
//
// Existing orders are deliberately left untouched: anything already
// placed (pending/accepted/ready_for_pickup) keeps going through its
// normal lifecycle exactly as before - GET /orders/shop/:shopId and the
// accept/ready/complete routes never check is_active, only ownership -
// so the owner can still fulfil what's already in progress. Deactivating
// only blocks NEW orders (via createOrder's existing is_active check);
// it is not a cancellation of what's already in flight.
const deactivateMyShop = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    shop.is_active = false;
    shop.deactivated_by = "vendor";
    await shop.save();

    res.status(200).json({
      message: "Your shop has been deactivated and is no longer visible to customers.",
      is_active: shop.is_active,
    });
  } catch (error) {
    console.error(`Failed to deactivate shop: ${error.message}`);
    res.status(500).json({ message: "Failed to deactivate shop" });
  }
};

// PATCH /shops/me/reactivate
// Reverses deactivateMyShop - the only way a shop owner brings their own
// shop back after deactivating it. Toggling is_open has no bearing on
// is_active in either direction (see deactivateMyShop's comment) - this
// is the one route that does.
const reactivateMyShop = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    // An admin takedown can only be reversed by an admin (PATCH
    // /admin/shops/:id/reactivate). null (legacy, or never deactivated)
    // is allowed, same as "vendor".
    if (shop.deactivated_by === "admin") {
      return res.status(403).json({
        message:
          "Your shop was deactivated by an administrator and cannot be self-reactivated — please contact support",
      });
    }

    shop.is_active = true;
    shop.deactivated_by = null;
    await shop.save();

    res.status(200).json({ message: "Your shop is active again.", is_active: shop.is_active });
  } catch (error) {
    console.error(`Failed to reactivate shop: ${error.message}`);
    res.status(500).json({ message: "Failed to reactivate shop" });
  }
};

// POST /shops/compare-pricing
// Lets a customer see what an order would actually cost at every eligible
// shop BEFORE committing to one - no upload needed yet, just page counts,
// since the whole point is comparing shops before picking where to
// actually upload and order. Takes the same per-document shape POST
// /orders does, minus shop_id and minus each document's upload_id - a
// page_count stands in for the document itself, since nothing is
// uploaded yet at comparison time.
//
// A shop that can't fulfil every requested service is EXCLUDED entirely,
// not shown with that service silently dropped or priced at 0 - a partial
// price is worse than no price, and it mirrors POST /orders' own refusal
// to charge for a service a shop hasn't enabled (see findUnsupportedDocumentService
// in utils/orderDocuments.js, the one predicate both routes share).
//
// Every remaining shop's price is computed with computeOrderPricing - the
// exact same function createOrder uses - so a price shown here can never
// drift from what actually gets charged if the customer orders there.
const comparePricing = async (req, res) => {
  try {
    const { documents, lat, lng, shop_id } = req.body;

    // Optional. Narrows the comparison to ONE shop, for the "Order from
    // this shop now" path: a customer who came in from a shop's own page
    // and chose to skip comparison still needs a real, server-computed
    // breakdown, and it should come from the same code that produces
    // every other quote rather than a second pricing path that could
    // drift from it.
    //
    // Deliberately a filter on this endpoint and not a new route: the
    // eligibility gates below (approved, active, can fulfil every
    // requested service) must apply identically whether one shop is being
    // priced or fifty. A shop that would be excluded from the comparison
    // returns an empty array here too, rather than being quietly priced
    // because it was asked for by name.
    if (shop_id !== undefined && !mongoose.isValidObjectId(shop_id)) {
      return res.status(400).json({ message: "shop_id must be a valid shop id" });
    }

    // Optional, same rules as GET /shops. Only ADDS distance_km - results
    // stay sorted by total_amount; sorting by distance is the client's call.
    const { point, error: geoError } = parseGeoPoint(lat, lng);
    if (geoError) {
      return res.status(400).json({ message: geoError });
    }

    // The same per-document shape POST /orders takes, minus upload_id:
    // nothing is uploaded yet at comparison time, so the caller sends each
    // document's page_count directly. Everything else - colour mode,
    // copies, paper size, sides, services - is per document exactly as it
    // will be on the real order, which is what makes this comparison
    // actually match what gets charged.
    if (!Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "documents (a non-empty array) is required" });
    }
    if (!documents.every((doc) => Number.isInteger(doc?.page_count) && doc.page_count > 0)) {
      return res.status(400).json({ message: "Every document needs a positive whole page_count" });
    }

    const { documents: settingsList, error: settingsError } = normalizeDocumentList(documents);
    if (settingsError) {
      return res.status(400).json({ message: settingsError });
    }

    // Requested service names stay as names here - each SHOP resolves
    // them against its own list below, because "lamination" is a different
    // service at a different price at every shop.
    const pricingInput = documents.map((doc, i) => ({
      page_count: doc.page_count,
      ...settingsList[i],
    }));

    // is_active: true here is the same gate as GET /shops - a deactivated
    // shop (PATCH /shops/me/deactivate or the admin equivalent) is
    // excluded from this comparison too, not just the plain listing.
    //
    // The availability fields are fetched (needed for
    // computeShopAvailability below) but never appear directly in a
    // result - only the computed shop_status/is_currently_open do, same
    // rule as GET /shops.
    const entries = await findListedShops({
      filter: {
        is_active: true,
        verification_status: "approved",
        ...(shop_id ? { _id: shop_id } : {}),
      },
      select: `shop_name address locality shop_photo_url pricing ${AVAILABILITY_FIELDS}`,
      point,
    });
    const distanceByShopId = new Map(entries.map(({ shop, distance_km }) => [shop._id.toString(), distance_km]));

    // Each shop resolves every requested service NAME against its own
    // list, by SUBSTRING match: a customer asking for "lamination" should
    // find the shop calling it "Matte Lamination" as well as the one
    // calling it "Lamination". Whatever each shop matched is what it gets
    // priced on, so two shops can legitimately quote differently-named,
    // differently-priced services for the same request - which is the
    // point of comparing them.
    //
    // A shop is out of the running if ANY document wants something it
    // can't match: the customer is placing one order, and a shop that
    // can't do all of it can't do it. POST /orders instead rejects with a
    // message naming the document, and matches EXACTLY rather than by
    // substring - see its own comment for why.
    const eligible = [];
    for (const { shop } of entries) {
      const resolvedPerDocument = [];
      let shopCanDoIt = true;

      for (const doc of pricingInput) {
        const { services, unmatched } = resolveDocumentServices(
          doc.requested_services,
          shop.pricing,
          findServiceByFuzzyName
        );
        if (unmatched) {
          shopCanDoIt = false;
          break;
        }
        resolvedPerDocument.push(services);
      }

      if (shopCanDoIt) eligible.push({ shop, resolvedPerDocument });
    }

    const eligibleShops = eligible.map(({ shop }) => shop);

    // Batched, same as GET /shops - one aggregation for every eligible
    // shop's queue info rather than one query per shop.
    const queueByShopId = await getQueueInfoForShops(eligibleShops.map((shop) => shop._id));
    const settings = await getPricingSettings();

    const results = eligible.map(({ shop, resolvedPerDocument }) => {
      const priced = computeOrderPricing({
        // This shop's OWN matched services and rates, not the requested
        // names - the price quoted is for what this shop would actually do.
        documents: pricingInput.map((doc, i) => ({ ...doc, services: resolvedPerDocument[i] })),
        shopPricing: shop.pricing,
        settings,
      });

      return {
        shop_id: shop._id,
        shop_name: shop.shop_name,
        shop_photo_url: shop.shop_photo_url,
        address: shop.address,
        locality: shop.locality,
        // Only present when lat/lng were sent; null for a shop with no location.
        ...(point ? { distance_km: distanceByShopId.get(shop._id.toString()) } : {}),
        total_amount: priced.total_amount,
        price_breakdown: {
          base_subtotal: priced.base_subtotal,
          paper_size_charge: priced.paper_size_charge,
          sides_charge: priced.sides_charge,
          services_charge: priced.services_charge,
          platform_fee: priced.platform_fee,
        },
        // What each document would cost at THIS shop, in the order they
        // were sent - so the app can show a per-file breakdown per shop
        // rather than only a total.
        document_totals: priced.documents.map((doc) => doc.pricing.document_total),
        // Which of this shop's services each document's request actually
        // matched, with the rate used. Different shops legitimately show
        // different names here for the same request, and the customer
        // should be able to see that before choosing.
        document_services: resolvedPerDocument,
        queue: queueByShopId.get(shop._id.toString()),
        // Not excluded from the results if closed - a customer comparing
        // prices should still be able to see and pick a closed shop for
        // later, just clearly marked as closed right now. Busy shops are
        // ordinary orderable results, flagged so the app can show the
        // longer estimate alongside the price.
        ...(({ status, prep_minutes }) => ({
          shop_status: status,
          busy_prep_minutes: prep_minutes,
          is_currently_open: status !== "closed",
        }))(computeShopAvailability(shop)),
      };
    });

    results.sort((a, b) => a.total_amount - b.total_amount);

    res.status(200).json(results);
  } catch (error) {
    console.error(`Failed to compare pricing: ${error.message}`);
    res.status(500).json({ message: "Failed to compare pricing" });
  }
};

// GET /shops/:shopId
// One shop's public profile, for the app's shop-details screen: photos,
// address/contact, what it charges, whether it's open, and how busy it
// is. Same visibility gate as GET /shops - an unapproved or deactivated
// shop is a 404 here too, not a viewable profile.
//
// Unlike the listing, this one DOES return pricing. The listing omits it
// because no screen there reads it and it would be a nested object per
// shop on every request; here it's the point of the screen - a customer
// deciding between shops should be able to see the rates before they
// upload anything. It's the shop's own advertised rate card, not an
// order quote: the platform fee and any per-order maths stay with
// POST /shops/compare-pricing, which is still what prices a real order.
//
// kyc/verification_status/owner_id are never selected, same rule as the
// listing - a customer has no business reading a shop's identity
// documents.
//
// Optional ?lat=&lng= adds distance_km, so the details screen can keep
// showing the same distance the card the customer tapped showed.
const getShopById = async (req, res) => {
  try {
    const { point, error } = parseGeoPoint(req.query.lat, req.query.lng);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const shop = await Shop.findOne({
      _id: req.params.shopId,
      is_active: true,
      verification_status: "approved",
    }).select(
      `shop_name address contact locality location google_maps_url google_maps_embed_url owner_photo_url shop_photo_url pricing ${AVAILABILITY_FIELDS}`
    );

    // Deliberately the same 404 whether the shop doesn't exist, isn't
    // approved yet, or was deactivated - a customer-facing route
    // shouldn't let someone probe which of those it is.
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const plain = toPublicShop(shop.toObject());

    // The shop's advertised opening times, for DISPLAY on its own detail
    // page - "Open 09:00-23:00" is what a customer reads off the door,
    // and it is the one thing the detail screen could not otherwise say.
    //
    // Re-attached here rather than by loosening toPublicShop, which is
    // shared with GET /shops and GET /saved-shops: those list routes stay
    // exactly as they were. is_currently_open remains the ONLY answer to
    // "can I order right now" - it is computed server-side against the
    // schedule AND the manual toggle, and nothing on the client may
    // re-derive that from these times. Only sent when a schedule is
    // actually enabled, so an absent field means "no fixed hours" rather
    // than "hours unknown".
    if (shop.business_hours?.enabled && shop.business_hours.open_time && shop.business_hours.close_time) {
      plain.business_hours = {
        open_time: shop.business_hours.open_time,
        close_time: shop.business_hours.close_time,
      };
    }

    plain.queue = await getShopQueueInfo(shop._id);
    if (point) plain.distance_km = distanceKmTo(point, plain);

    res.status(200).json(plain);
  } catch (error) {
    console.error(`Failed to fetch shop: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch shop" });
  }
};


// 4 letters, a literal 0, then 6 alphanumerics - e.g. HDFC0001234. The
// fifth character is reserved by RBI and is always 0, which is the one
// part of the format a typo most often gets wrong.
const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

// PATCH /shops/me/payout
// Shop owner sets where they want to be paid. Partial update, same
// spirit as the other /me routes: send only the fields being changed.
//
// These details are used by a HUMAN - an admin reading them off a screen
// and making a UPI or bank transfer by hand. No money moves through this
// system and nothing here reaches a payment gateway, so nothing is
// verified against a bank; the only thing validated is that the IFSC is
// well-formed, because a malformed one is a typo the vendor can fix now
// rather than a failed transfer someone discovers later.
//
// Send an empty string to clear a field (a vendor who switches from a
// bank account to UPI should be able to remove the stale account), which
// is why "" is accepted while a malformed non-empty IFSC is not.
const updateMyPayout = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    const { account_holder_name, account_number, ifsc_code, upi_id } = req.body;

    const fields = { account_holder_name, account_number, ifsc_code, upi_id };
    const sent = Object.keys(fields).filter((k) => fields[k] !== undefined);
    if (sent.length === 0) {
      return res.status(400).json({
        message:
          "Send at least one of account_holder_name, account_number, ifsc_code or upi_id to update.",
      });
    }
    for (const key of sent) {
      if (typeof fields[key] !== "string") {
        return res.status(400).json({ message: `${key} must be a string` });
      }
    }

    if (ifsc_code !== undefined && ifsc_code.trim() !== "" && !IFSC_REGEX.test(ifsc_code.trim())) {
      return res.status(400).json({
        message:
          "ifsc_code must be 11 characters: 4 letters, then 0, then 6 letters or digits (e.g. HDFC0001234)",
      });
    }

    // Which fields this edit actually CHANGES - not merely which were
    // sent. A client that resends the whole form unchanged should not
    // produce a history row saying the bank account changed, because
    // that row is exactly the signal an admin is meant to act on.
    const changed = [];
    const apply = (key, value) => {
      if (value === undefined) return;
      const next = key === "ifsc_code" ? value.trim().toUpperCase() : value.trim();
      if ((shop.payout?.[key] || "") === next) return;
      shop.payout[key] = next;
      changed.push(key);
    };
    apply("account_holder_name", account_holder_name);
    apply("account_number", account_number);
    apply("ifsc_code", ifsc_code);
    apply("upi_id", upi_id);

    if (changed.length === 0) {
      // Nothing moved, so nothing is logged and updated_at is left
      // alone - "last changed" must keep meaning last CHANGED.
      return res.status(200).json({ payout: shop.payout, changed: [] });
    }

    shop.payout.updated_at = new Date();
    await shop.save();

    // Field names only, never values - see models/PayoutHistory.js.
    await PayoutHistory.create({
      shop_id: shop._id,
      changed_field_summary: changed.join(", "),
      changed_by: req.user.id,
      changed_by_role: "shop_owner",
      changed_at: shop.payout.updated_at,
    });

    res.status(200).json({ payout: shop.payout, changed });
  } catch (error) {
    console.error(`Failed to update payout details: ${error.message}`);
    res.status(500).json({ message: "Failed to update payout details" });
  }
};

// GET /shops/me/settlements
// What this vendor is owed and what they have already been paid.
//
// Scoped to their OWN shop by owner_id (loadMyShop), never by an id from
// the request - a vendor cannot read another vendor's earnings by
// guessing a shop id, because no shop id is accepted here at all.
const getMySettlements = async (req, res) => {
  try {
    const shop = await loadMyShop(req, res);
    if (!shop) return;

    // Same eligibility rule the admin side uses (see
    // controllers/adminController.js): completed, paid, not yet settled.
    // Kept identical on purpose - a vendor being shown a pending total
    // the admin's screen doesn't agree with would be worse than showing
    // nothing.
    const [pending] = await Order.aggregate([
      {
        // The shared definition, so this can never disagree with the
        // admin's pending list - see utils/settlement.js.
        $match: { shop_id: shop._id, ...SETTLEABLE },
      },
      {
        $group: {
          _id: null,
          order_count: { $sum: 1 },
          total_amount: { $sum: { $ifNull: ["$vendor_amount", 0] } },
          oldest_order_at: { $min: "$createdAt" },
        },
      },
    ]);

    const history = await Settlement.find({ shop_id: shop._id })
      .select("total_amount settled_at reference_note order_ids")
      .sort({ settled_at: -1 })
      .lean();

    res.status(200).json({
      unsettled: {
        order_count: pending?.order_count || 0,
        total_amount: round2(pending?.total_amount || 0),
        oldest_order_at: pending?.oldest_order_at || null,
      },
      // Deliberately no order documents here - a vendor asking "what am
      // I owed" wants the number and the history, and their own order
      // list already lives at GET /orders/shop/:shopId.
      settlements: history.map((row) => ({
        _id: row._id,
        settled_at: row.settled_at,
        total_amount: row.total_amount,
        reference_note: row.reference_note || "",
        order_count: row.order_ids.length,
      })),
    });
  } catch (error) {
    console.error(`Failed to fetch settlements: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch settlements" });
  }
};

module.exports = {
  getShopById,
  updateMyPayout,
  getMySettlements,
  createShop,
  getActiveShops,
  getMyShop,
  getShopQueue,
  uploadShopPhotos,
  submitKyc,
  getMyPricing,
  updateMyPricing,
  addMyService,
  updateMyService,
  deleteMyService,
  updateMyStatus,
  updateMyLocation,
  deactivateMyShop,
  reactivateMyShop,
  comparePricing,
};
