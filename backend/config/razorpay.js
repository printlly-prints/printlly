const Razorpay = require("razorpay");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// The Razorpay SDK throws synchronously in its constructor if key_id is
// missing, which would otherwise crash the WHOLE server - every route,
// not just payments - just because Razorpay hasn't been configured yet.
// Same guard shape as Google OAuth (see config/passport.js): construct
// the client only when configured, and let routes/paymentRoutes.js answer
// 501 on the two payment routes instead when it isn't.
const isRazorpayConfigured = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

let razorpay = null;
if (isRazorpayConfigured) {
  // Used to create orders server-side (see controllers/paymentController.js).
  // key_secret never leaves this process - it's what signs orders and
  // what payment verification's HMAC is checked against, so it stays out
  // of every API response.
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
} else {
  console.warn(
    "[razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in .env. " +
      "POST /payments/razorpay/* will return 501 until configured."
  );
}

// The webhook secret is a DIFFERENT secret from key_secret. Razorpay
// generates it when a webhook endpoint is registered in the dashboard, and it
// is what signs the webhook body - key_secret signs the client-side payment
// response. Using one in place of the other produces a signature that never
// matches, which is a confusing failure to debug, hence the separate name and
// this note.
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const isWebhookConfigured = Boolean(RAZORPAY_WEBHOOK_SECRET);

// Fail at startup rather than at the first real payment.
//
// Without the secret, POST /payments/webhook cannot authenticate anything it
// receives, so it has to refuse every event. In production that means
// Razorpay confirmations are being dropped while customers are being charged
// - and the only symptom is orders quietly stuck at payment_status "created".
// A deploy that refuses to start is a far better failure than that.
//
// Only enforced when Razorpay is itself configured: a deployment with
// payments switched off has no webhook to secure.
if (isRazorpayConfigured && !isWebhookConfigured && process.env.NODE_ENV === "production") {
  throw new Error(
    "RAZORPAY_WEBHOOK_SECRET is not set but Razorpay is configured and NODE_ENV=production. " +
      "Refusing to start: without it the payment webhook cannot verify Razorpay's signature, so every " +
      "server-to-server payment confirmation would be rejected and paid orders would never be marked paid. " +
      "Set it to the secret shown for this endpoint in Razorpay Dashboard > Settings > Webhooks."
  );
}

if (isRazorpayConfigured && !isWebhookConfigured) {
  console.warn(
    "[razorpay] RAZORPAY_WEBHOOK_SECRET is not set. POST /payments/webhook will answer 503 until it is. " +
      "Payments still work through the client callback, but a customer who closes the app mid-payment " +
      "will leave an order stuck unpaid."
  );
}

module.exports = {
  razorpay,
  isRazorpayConfigured,
  webhookSecret: RAZORPAY_WEBHOOK_SECRET,
  isWebhookConfigured,
};
