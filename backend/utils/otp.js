// Generates a random 6-digit OTP as a string (e.g. "042917").
// The customer shows this at the shop counter to collect their prints.
//
// Used only from paymentController.js's verify handler, once a payment's
// signature has actually been confirmed - see models/Order.js for why
// this is no longer generated at order-creation time.
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { generateOtp };
