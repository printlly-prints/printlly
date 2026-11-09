const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  createShop,
  getActiveShops,
  getMyShop,
  getShopQueue,
  getShopById,
  uploadShopPhotos,
  submitKyc,
  getMyPricing,
  updateMyPricing,
  addMyService,
  updateMyService,
  deleteMyService,
  updateMyStatus,
  updateMyPayout,
  getMySettlements,
  getMyActivity,
  updateMyLocation,
  deactivateMyShop,
  reactivateMyShop,
  comparePricing,
} = require("../controllers/shopController");
const { verifyToken, requireRole } = require("../middleware/auth");
const { previewGoogleMaps } = require("../controllers/shopGoogleMapsController");

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB per photo
const MAX_KYC_FILE_SIZE = 5 * 1024 * 1024; // 5MB - not specified, matched to the photo limit

const IMAGE_MIMETYPES = ["image/jpeg", "image/png"];
const KYC_MIMETYPES = [...IMAGE_MIMETYPES, "application/pdf"];

// Files are held in memory and streamed straight to Cloudinary, same as
// uploadRoutes.js - nothing is ever written to the server's disk.
//
// Unlike uploadRoutes.js's document upload (which validates per-file in
// the controller so one bad file doesn't sink a whole batch), each of
// these routes takes a small, fixed set of fields - a fileFilter here,
// rejecting the whole request up front, is simpler and appropriate.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_SIZE },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_MIMETYPES.includes(file.mimetype)) {
      return cb(new Error("Only JPG or PNG images are allowed."));
    }
    cb(null, true);
  },
});

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_KYC_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!KYC_MIMETYPES.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG or PDF files are allowed for the id proof."));
    }
    cb(null, true);
  },
});

// Register a new shop - only authenticated shop owners can do this
router.post("/", verifyToken, requireRole("shop_owner"), createShop);
router.post("/google-maps-preview", verifyToken, requireRole("shop_owner"), previewGoogleMaps);

// The logged-in shop owner's own shop, used to decide whether to show the
// shop setup form. Must come before any "/:id"-style route if one is
// added later, so it isn't swallowed by an id param. (":shopId/queue"
// below has a literal "/queue" suffix, so it can't collide with "/me"
// either way - but the rule still applies to whatever gets added next.)
router.get("/me", verifyToken, requireRole("shop_owner"), getMyShop);

// Shop owner uploads their own photo and/or shopfront photo - public,
// customer-facing images (unlike the KYC route below).
router.post(
  "/me/photos",
  verifyToken,
  requireRole("shop_owner"),
  photoUpload.fields([
    { name: "owner_photo", maxCount: 1 },
    { name: "shop_photo", maxCount: 1 },
    { name: "shop_logo", maxCount: 1 },
  ]),
  uploadShopPhotos
);

// Shop owner submits (or resubmits) KYC. The id proof itself never
// leaves this route in any response - see submitKyc's own comment.
router.post("/me/kyc", verifyToken, requireRole("shop_owner"), kycUpload.single("id_proof"), submitKyc);

// Shop owner views/edits their own pricing. Everything a shop can charge
// for except platform_fee, which stays global (Settings) and has no
// route here at all - see models/Shop.js's pricing schema comment.
router.get("/me/pricing", verifyToken, requireRole("shop_owner"), getMyPricing);
router.patch("/me/pricing", verifyToken, requireRole("shop_owner"), updateMyPricing);

// A shop's finishing services are a vendor-defined list, not a fixed set,
// so each one is added/edited/removed on its own rather than patched
// wholesale through /me/pricing above. Deleting is always safe for
// existing orders - they store a snapshot of what was sold, not a live
// reference (see models/Order.js).
router.post("/me/pricing/services", verifyToken, requireRole("shop_owner"), addMyService);
router.patch("/me/pricing/services/:serviceId", verifyToken, requireRole("shop_owner"), updateMyService);
router.delete("/me/pricing/services/:serviceId", verifyToken, requireRole("shop_owner"), deleteMyService);

// Shop owner toggles is_open and/or configures business_hours - whether
// the shop is CURRENTLY accepting orders, separate from is_active/
// verification_status above (which control whether it's listed at all).
router.patch("/me/status", verifyToken, requireRole("shop_owner"), updateMyStatus);

// Shop owner sets where they want to be paid. These details are read by
// a HUMAN admin who then makes a UPI or bank transfer by hand - no money
// moves through this platform. Shop-owner only: the handler resolves the
// shop from the token's owner_id and accepts no shop id, so one vendor
// cannot write another's bank details.
router.patch("/me/payout", verifyToken, requireRole("shop_owner"), updateMyPayout);

// What this vendor is owed and what has already been paid to them.
// Scoped to their own shop the same way - no other vendor's earnings are
// reachable from here.
router.get("/me/settlements", verifyToken, requireRole("shop_owner"), getMySettlements);

// This vendor's own request and dispatch log, scoped the same way.
router.get("/me/activity", verifyToken, requireRole("shop_owner"), getMyActivity);

// Shop owner sets their map pin (latitude/longitude) and searchable
// locality label - used by GET /shops ?search= and ?lat/&lng.
router.patch("/me/location", verifyToken, requireRole("shop_owner"), updateMyLocation);

// Shop owner takes their own shop off the platform entirely, or brings it
// back - a longer-term state than is_open/business_hours above (see
// deactivateMyShop's own comment in shopController.js for exactly how
// the two differ and how existing orders are handled).
router.patch("/me/deactivate", verifyToken, requireRole("shop_owner"), deactivateMyShop);
router.patch("/me/reactivate", verifyToken, requireRole("shop_owner"), reactivateMyShop);

// Customer-only: compare what an order would cost across every eligible
// shop before picking one. A literal path, not "/:shopId"-shaped, so it
// can sit anywhere relative to the param routes below without risk of
// being swallowed by one - kept here next to the other pricing routes.
router.post("/compare-pricing", verifyToken, requireRole("customer"), comparePricing);

// Live rush/queue indicator for one shop - public, no auth, so a
// customer can see it while just browsing, before logging in.
router.get("/:shopId/queue", getShopQueue);

// One shop's public profile - the app's shop-details screen. Declared
// after every literal path above (/me/*, /compare-pricing) so those are
// never swallowed by this parameter.
router.get("/:shopId", verifyToken, getShopById);

// List all active, verified shops - open to any logged-in user
// (typically customers browsing). Optional ?search= and ?lat=&lng=.
router.get("/", verifyToken, getActiveShops);

// Turns multer's errors (and the custom fileFilter errors above) into
// clear JSON messages instead of an HTML stack trace. Must take four
// arguments for Express to treat it as error-handling middleware. Only
// ever engaged by the two upload routes above - none of the others in
// this router ever call next(err).
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "One of the files is too large. Maximum size is 5MB each." });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ message: "Unexpected file field." });
  }
  if (err) {
    return res.status(400).json({ message: err.message || "Upload rejected." });
  }
  next();
});

module.exports = router;
