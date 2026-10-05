const express = require("express");
const router = express.Router();
const {
  listShops,
  getShopDetail,
  verifyShop,
  deactivateShop,
  reactivateShop,
  getOverviewStats,
  listOrders,
  getSettings,
  updateSettings,
} = require("../controllers/adminController");
const {
  listConversations,
  getConversationDetail,
  postAdminMessage,
  markConversationReadByAdmin,
} = require("../controllers/supportController");
const {
  getPendingSettlements,
  getShopSettlementDetail,
  settleShopOrders,
  listSettlements,
} = require("../controllers/settlementController");
const { verifyToken, requireRole } = require("../middleware/auth");

// Auth is applied ONCE here, to the whole router, rather than repeated on
// each route below. Every route in this file is admin-only without
// exception, so router-level middleware is both the accurate expression
// of that and the safer one: a route added later inherits the protection
// instead of depending on whoever adds it remembering to repeat it.
//
// Order matters - verifyToken populates req.user, which requireRole then
// reads. A request with no token gets 401 from the first, a valid
// customer or shop_owner token gets 403 from the second.
router.use(verifyToken, requireRole("admin"));

// --- Vendor verification -------------------------------------------------

// Every shop, any status. Filters: ?verification_status= ?is_active=
// ?search= plus the standard ?limit/?skip.
router.get("/shops", listShops);

// One shop in full, including a freshly-signed short-lived URL for its
// KYC id proof. Deliberately a separate route from the list above so that
// link is only ever minted when an admin actually opens a shop to review
// it - see getShopDetail's comment.
router.get("/shops/:id", getShopDetail);

// Approve or reject. Replaces the old PATCH /shops/:id/verify, which has
// been removed from routes/shopRoutes.js - this is the same logic plus a
// notification to the shop owner.
router.patch("/shops/:id/verify", verifyShop);

// --- Shop moderation -----------------------------------------------------

// Admin equivalents of the vendor's own PATCH /shops/me/(de|re)activate.
// The vendor routes still exist and are unchanged; these differ only in
// applying to any shop rather than the caller's own. The old admin-only
// PATCH /shops/:id/deactivate has been removed from shopRoutes.js in
// favour of these two.
router.patch("/shops/:id/deactivate", deactivateShop);
router.patch("/shops/:id/reactivate", reactivateShop);

// --- Platform overview ---------------------------------------------------

router.get("/stats/overview", getOverviewStats);

// --- Order monitoring ----------------------------------------------------

// Read-only. There is intentionally no admin route that changes an
// order's status - see listOrders' comment in the controller for why.
router.get("/orders", listOrders);

// --- Platform settings ---------------------------------------------------

// --- manual settlements -------------------------------------------
// Bookkeeping for transfers an admin makes BY HAND (UPI/bank) outside
// this platform. Nothing here moves money - see
// controllers/settlementController.js.
//
// /pending and the audit list come before /shop/:shopId so a literal
// path segment is never swallowed by the parameterised one.
router.get("/settlements/pending", getPendingSettlements);
router.get("/settlements", listSettlements);
router.get("/settlements/shop/:shopId", getShopSettlementDetail);
router.post("/settlements/shop/:shopId/settle", settleShopOrders);

router.get("/settings", getSettings);
router.patch("/settings", updateSettings);

// --- Customer support ----------------------------------------------------

// The admin half of the support chat. Its customer-facing half lives in
// routes/supportRoutes.js, and both sides send through the same shared
// function (utils/supportMessaging.js) so a reply typed here reaches a
// socket-connected customer live, not on their next refresh.
//
// Addressed by CUSTOMER id rather than conversation id throughout: there
// is exactly one thread per customer, so the customer is the identity
// that matters, and it spares the panel a lookup just to learn a
// conversation id it would only use to name a customer it already knows.
router.get("/support/conversations", listConversations);

// Full history plus who this customer is and what they have ordered
// lately - everything needed to answer, in one request.
router.get("/support/conversations/:customerId", getConversationDetail);

router.post("/support/conversations/:customerId/messages", postAdminMessage);
router.patch("/support/conversations/:customerId/read", markConversationReadByAdmin);

module.exports = router;
