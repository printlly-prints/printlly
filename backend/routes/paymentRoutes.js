const express = require("express");
const router = express.Router();
const { createRazorpayOrder, verifyRazorpayPayment } = require("../controllers/paymentController");
const { verifyToken, requireRole } = require("../middleware/auth");
const { isRazorpayConfigured } = require("../config/razorpay");

// Registered conditionally: the Razorpay SDK throws if credentials are
// missing, so when RAZORPAY_KEY_ID/KEY_SECRET aren't set in .env, these
// two routes just answer 501 instead of the whole server failing to start
// (see config/razorpay.js for the same guard).
if (isRazorpayConfigured) {
  // Customer starts paying for an order they already created (POST /orders)
  router.post("/razorpay/create-order", verifyToken, requireRole("customer"), createRazorpayOrder);

  // Customer's checkout finished client-side; this is the only place the
  // payment is actually trusted - see controllers/paymentController.js.
  router.post("/razorpay/verify", verifyToken, requireRole("customer"), verifyRazorpayPayment);
} else {
  const notConfigured = (req, res) =>
    res.status(501).json({
      message: "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.",
    });
  router.post("/razorpay/create-order", notConfigured);
  router.post("/razorpay/verify", notConfigured);
}

module.exports = router;
