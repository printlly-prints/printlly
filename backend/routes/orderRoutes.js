const express = require("express");
const router = express.Router();
const {
  createOrder,
  getOrdersForShop,
  getMyOrders,
  acceptOrder,
  readyOrder,
  completeOrder,
  viewOrderDocument,
} = require("../controllers/orderController");
const { verifyToken, requireRole } = require("../middleware/auth");
const { otpVerifyLimiter } = require("../middleware/rateLimit");

// Customer places a new print order (generates a 6-digit pickup OTP)
router.post("/", verifyToken, requireRole("customer"), createOrder);

// Customer views their own order history (mobile app "My orders" screen)
router.get("/customer", verifyToken, requireRole("customer"), getMyOrders);

// Shop owner views every order placed at one of their shops
router.get("/shop/:shopId", verifyToken, requireRole("shop_owner"), getOrdersForShop);

// Streams one of an order's documents inline, for the dashboard's own
// viewer. No requireRole: the handler allows either the order's customer
// or the owner of the shop it was placed at, which is a per-order check
// rather than a role one.
router.get("/:id/documents/:index/view", verifyToken, viewOrderDocument);

// Shop owner accepts a pending order
router.patch("/:id/accept", verifyToken, requireRole("shop_owner"), acceptOrder);

// Shop owner marks an accepted order as ready for pickup
router.patch("/:id/ready", verifyToken, requireRole("shop_owner"), readyOrder);

// Shop owner completes the order after verifying the customer's OTP
// The pickup OTP is the one secret in the system short enough to guess: six
// digits, held by the customer, checked here. otpVerifyLimiter caps wrong
// guesses per order (see middleware/rateLimit.js) so the shop holding the
// order cannot work through the keyspace and release someone's documents
// without them. Correct completions are refunded and so never hit it.
router.patch("/:id/complete", verifyToken, requireRole("shop_owner"), otpVerifyLimiter, completeOrder);

module.exports = router;
