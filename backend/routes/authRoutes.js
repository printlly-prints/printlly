const express = require("express");
const router = express.Router();
const {
  register,
  login,
  googleCallback,
  exchangeCode,
  logout,
  changePassword,
} = require("../controllers/authController");
const { passport, isGoogleConfigured } = require("../config/passport");
const { verifyToken,requireRole } = require("../middleware/auth");
const {updateCustomerProfile}=require('../controllers/customerProfileController');
const { customerGoogleLogin } = require("../controllers/customerGoogleController");

// --- Existing customer/shop-owner email+password auth (unchanged) ---

// Register a new customer or shop owner account
router.post("/register", register);

// Log in with email + password, receive a JWT
router.post("/login", login);
router.patch('/me',verifyToken,requireRole('customer'),updateCustomerProfile);
router.post("/google/customer", customerGoogleLogin);

// --- Google OAuth for shop owners only ---
// Registered conditionally: passport-google-oauth20 throws if credentials
// are missing, so when GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL aren't set in
// .env, these two routes just answer 501 instead of the whole server
// failing to start (see config/passport.js for the same guard).
if (isGoogleConfigured) {
  // Step 1: send the browser to Google's consent screen.
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
  );

  // Step 2: Google redirects back here with the result. We use the
  // callback-style passport.authenticate (rather than failureRedirect) so
  // we can forward the real failure reason to the frontend as a query
  // param instead of a generic error.
  router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      if (err) {
        console.error("Google OAuth error:", err);
        return res.redirect(`${frontendUrl}/auth/callback?error=server_error`);
      }
      if (!user) {
        const reason = info?.message || "Google sign-in failed";
        return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(reason)}`);
      }

      req.user = user;
      // Async since sessions were introduced - a rejection here (a failed
      // session write) would otherwise be unhandled and leave the browser
      // waiting, so it is turned into the same redirect any other OAuth
      // failure produces.
      return googleCallback(req, res).catch((callbackError) => {
        console.error("Google OAuth callback failed:", callbackError.message);
        res.redirect(`${frontendUrl}/auth/callback?error=server_error`);
      });
    })(req, res, next);
  });
} else {
  const notConfigured = (req, res) =>
    res.status(501).json({
      message:
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL in .env.",
    });
  router.get("/google", notConfigured);
  router.get("/google/callback", notConfigured);
}

// Exchanges the one-time code from the Google redirect for the real JWT.
router.post("/exchange-code", exchangeCode);

// --- Session management ---

// Revokes the session this request authenticated with, and only that one.
// Authenticated, because there is nothing to revoke without knowing which
// session is being ended - and a logout that took a token in the body would
// let anyone end a session they merely know the id of.
router.post("/logout", verifyToken, logout);

// Changes the caller's password. Revokes every other session and returns a
// fresh token for this one - see controllers/authController.js for why that
// is the chosen behaviour.
router.post("/change-password", verifyToken, changePassword);

module.exports = router;
