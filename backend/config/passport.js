const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL;

// Google Sign-In is only for shop owners; the customer app keeps using
// POST /auth/register and /auth/login untouched (see authController.js).
//
// The strategy is registered only when credentials are present.
// passport-google-oauth20 throws synchronously if clientID/clientSecret
// are missing, which would otherwise crash the whole server - including
// the existing email/password auth - just because Google hasn't been
// configured yet. See routes/authRoutes.js for the matching guard on the
// /auth/google* routes themselves.
const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL);

if (isGoogleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(null, false, { message: "Your Google account has no email address" });
          }

          // Matched by google_id first, then by email, per spec.
          let user = await User.findOne({ google_id: profile.id });

          if (!user) {
            user = await User.findOne({ email });

            if (user) {
              // An account with this email already exists but isn't a
              // shop owner (e.g. the customer app). Since email is unique
              // across all users, we cannot also create a separate
              // shop_owner account with the same address - and silently
              // turning someone's customer account into a shop owner
              // would be worse. Reject clearly instead.
              if (user.role !== "shop_owner") {
                return done(null, false, {
                  message: "This email is already registered as a customer account",
                });
              }

              // Existing shop owner who originally signed up with
              // email/password - link their Google identity so they can
              // use either method from now on.
              user.google_id = profile.id;
              user.auth_provider = "google";
              await user.save();
            } else {
              const name =
                profile.displayName ||
                [profile.name?.givenName, profile.name?.familyName].filter(Boolean).join(" ") ||
                email.split("@")[0];

              user = await User.create({
                name,
                email,
                google_id: profile.id,
                auth_provider: "google",
                role: "shop_owner",
              });
            }
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
} else {
  console.warn(
    "[passport] Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / " +
      "GOOGLE_CALLBACK_URL missing from .env). GET /auth/google will return 501 until set."
  );
}

module.exports = { passport, isGoogleConfigured };
