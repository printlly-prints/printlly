const mongoose = require("mongoose");
const { validateProfileDetails } = require("../utils/profileDetails");

// A User can either be a customer placing print orders, or a shop_owner
// who manages a shop and fulfills orders. auth_provider distinguishes
// accounts created via the existing email/password flow from those
// created via Google Sign-In (shop owners only, see config/passport.js).
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      // Only the local (email/password) signup flow collects a phone
      // number - POST /auth/register still enforces this itself.
      // Google-created accounts have no phone, so it can't be required
      // at the schema level for them.
      //
      // Admins are exempt for the same reason: a phone number is a
      // customer/vendor concept (order contact, shop contact), and an
      // admin account exists only to sign into the admin panel. They are
      // created by scripts/createAdmin.js, which deliberately collects
      // nothing beyond name/email/password.
      required: function () {
        return this.auth_provider !== "google" && this.role !== "admin";
      },
      unique: true,
      sparse: true, // allows many Google users to have no phone at all
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Optional contact email is not a credential or a verified address.
    contact_email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      maxlength: 254,
      validate: { validator: (value) => value == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), message: "Invalid contact email" },
    },
    // Calendar date, stored without timezone conversion.
    date_of_birth: {
      type: String,
      default: null,
      validate: {
        validator: (value) => !validateProfileDetails({ date_of_birth: value }).error,
        message: "Invalid date of birth",
      },
    },
    password_hash: {
      type: String,
      // Not required for Google accounts - they authenticate via OAuth,
      // never set a password on our side.
      required: function () {
        return !this.google_id;
      },
    },
    google_id: {
      type: String,
      unique: true,
      sparse: true, // allows many local users to have no google_id
    },
    auth_provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    // "admin" is never assignable via POST /auth/register (see
    // authController.js, which whitelists role to shop_owner/customer
    // only) - an admin account is provisioned directly against the
    // database until an admin panel exists. See PATCH /shops/:id/verify,
    // the one route gated on it today.
    role: {
      type: String,
      enum: ["customer", "shop_owner", "admin"],
      default: "customer",
    },
    // When this user last changed their password. Defaults to null, and
    // stays null on every account that has never changed one. The default
    // matters: anything other than null - a timestamp of "now", say - would
    // be stamped on existing users the next time they were saved and would
    // invalidate their current tokens for no reason.
    //
    // Read by middleware/auth.js for ONE case: a token carrying no jti
    // (issued before session records existed) is refused if it was issued
    // before this moment. That is what lets a password change cut off older
    // sessions that have no session record to revoke. Tokens that do carry a
    // jti are handled by revoking their Session rows instead.
    password_changed_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
