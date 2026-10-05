const mongoose = require("mongoose");

// One record per device a user has registered for push notifications.
//
// Per DEVICE, not per user. A customer with a phone and a tablet, or who
// replaces their phone, has several tokens - storing a single token per user
// would silently stop notifying every device but the most recently seen one,
// and the symptom (notifications arriving on one device only) is the kind of
// thing nobody reports as a bug.
//
// WHAT IS STORED, AND WHAT IS NOT
//
// The token itself is the address Expo delivers to. It is not a credential for
// anything of ours, but it IS capability-bearing: anyone holding it can send
// that device a notification through Expo. So it is never logged (see
// utils/pushNotifications.js, which logs a short fingerprint instead) and
// never returned by any API response.
//
// No device name, model, OS version, locale or advertising id. None is needed
// to deliver a notification, and each would be personal information retained
// for no purpose. platform is kept only because Expo's receipts and the
// invalid-token rules differ between iOS and Android, which matters when
// working out why a device stopped receiving anything.
const deviceTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Every send starts "which devices does this user have?", so this is
      // the one index that matters for delivery.
      index: true,
    },
    // An Expo push token, e.g. "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]".
    //
    // Unique across the whole collection, not per user, and that is
    // deliberate: the token identifies a DEVICE. If a phone is handed on or a
    // second account signs in on it, Expo issues the same token, and the
    // record must move to the new owner rather than exist twice - otherwise
    // the previous owner keeps receiving the new owner's notifications. The
    // registration endpoint upserts on this field for exactly that reason.
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    // Set false when Expo tells us the token is dead (DeviceNotRegistered -
    // the app was uninstalled, or the token was rotated). Kept rather than
    // deleted so a device that re-registers is an update of one row, and so
    // "why did this user stop getting notifications" is answerable.
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Last time this token was successfully used, or re-registered. Useful
    // for pruning devices that have been silent for a very long time; nothing
    // currently prunes on it, which is called out in the report rather than
    // implied.
    last_used_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false }, versionKey: false }
);

// The delivery query: this user's live devices.
deviceTokenSchema.index({ user_id: 1, active: 1 });

module.exports = mongoose.model("DeviceToken", deviceTokenSchema);
