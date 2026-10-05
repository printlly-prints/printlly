const express = require("express");
const router = express.Router();
const { handleRazorpayWebhook } = require("../controllers/paymentWebhookController");

// Razorpay's server-to-server payment confirmation.
//
// Deliberately its OWN router rather than a route inside paymentRoutes.js,
// because it needs two things the rest of /payments must not get:
//
//   1. the RAW request body, for HMAC verification. It is mounted with
//      express.raw() ahead of the global express.json() (see server.js) -
//      a parsed-then-reserialised body is not guaranteed to reproduce
//      Razorpay's exact bytes, and one byte of difference breaks the
//      signature.
//
//   2. a different rate limit. The other payment routes are limited per
//      authenticated user, which is meaningless here: Razorpay has no JWT,
//      so every delivery would share one IP bucket and a busy evening of
//      payments plus retries could get legitimate confirmations throttled.
//
// It is NOT behind verifyToken, and must not be. Razorpay does not hold a
// customer's token; the webhook signature IS the authentication, and it is
// checked on every request before anything in the payload is trusted.
router.post("/", handleRazorpayWebhook);

module.exports = router;
