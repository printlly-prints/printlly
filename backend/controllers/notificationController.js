const Notification = require("../models/Notification");
const { Expo } = require("expo-server-sdk");
const DeviceToken = require("../models/DeviceToken");

// GET /notifications
// Most recent first, capped at 50 (no cursor/offset pagination - not
// needed at this scale, and the task explicitly allows a flat cap here).
const getNotifications = async (req, res) => {
  try {
    // .lean(): these are read-only and go straight out as JSON - no
    // document methods or virtuals are used on them. The existing cap of
    // 50 already bounds this route, so no pagination params are added
    // here (unlike the order lists, which had none).
    const notifications = await Notification.find({ user_id: req.user.id })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();

    res.status(200).json(notifications);
  } catch (error) {
    console.error(`Failed to fetch notifications: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// PATCH /notifications/:id/read
// Marks a single notification read. Scoped to the logged-in user so one
// customer can never mark (or even discover the existence of) another's.
const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json(notification);
  } catch (error) {
    console.error(`Failed to update notification: ${error.message}`);
    res.status(500).json({ message: "Failed to update notification" });
  }
};

// PATCH /notifications/read-all
// Marks every unread notification for the logged-in user as read in one
// call (e.g. a "clear all" button).
const markAllNotificationsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user_id: req.user.id, read: false },
      { $set: { read: true } }
    );

    res.status(200).json({ updated: result.modifiedCount });
  } catch (error) {
    console.error(`Failed to update notifications: ${error.message}`);
    res.status(500).json({ message: "Failed to update notifications" });
  }
};


// POST /notifications/device-token
// Body: { token, platform }
//
// Registers the calling user's device for push notifications.
//
// The owner is taken from req.user.id - the verified JWT - and NEVER from the
// body. A client that could name its own user_id could register a token
// against someone else's account and receive their notifications.
//
// Upserts on the token, because the token identifies a DEVICE: re-opening the
// app, or a second account signing in on the same phone, yields the same
// token from Expo, and the record must move to the current owner rather than
// exist twice. That also makes repeated registration on every app launch
// free, which is how the client is expected to use it.
const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform } = req.body || {};

    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ message: "token is required" });
    }
    if (!["ios", "android", "web"].includes(platform)) {
      return res.status(400).json({ message: "platform must be ios, android or web" });
    }
    // Rejected here rather than stored and discovered at send time. Expo's
    // own validator, so this agrees exactly with what delivery will accept.
    if (!Expo.isExpoPushToken(token.trim())) {
      return res.status(400).json({ message: "token is not a valid Expo push token" });
    }

    await DeviceToken.findOneAndUpdate(
      { token: token.trim() },
      {
        $set: {
          user_id: req.user.id,
          platform,
          active: true,
          last_used_at: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    // The token is not echoed back. There is nothing for the client to learn
    // from it - it sent it - and a response that repeats it puts it in one
    // more place.
    res.status(200).json({ message: "Device registered for notifications" });
  } catch (error) {
    console.error(`Failed to register device token: ${error.message}`);
    res.status(500).json({ message: "Could not register this device" });
  }
};

// DELETE /notifications/device-token
// Body: { token }
//
// Deactivates one device, for sign-out. Scoped to the caller's own tokens, so
// a client cannot deactivate somebody else's device by knowing its token -
// and it deactivates only the token named, leaving the user's other devices
// receiving notifications.
const unregisterDeviceToken = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== "string" || !token.trim()) {
      return res.status(400).json({ message: "token is required" });
    }

    await DeviceToken.updateOne(
      { token: token.trim(), user_id: req.user.id },
      { $set: { active: false } }
    );

    // Always 200, whether or not a record matched: the caller learns only
    // that the device will not be notified, which is true either way, and
    // never whether that token was registered to them.
    res.status(200).json({ message: "Device will no longer receive notifications" });
  } catch (error) {
    console.error(`Failed to unregister device token: ${error.message}`);
    res.status(500).json({ message: "Could not unregister this device" });
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerDeviceToken,
  unregisterDeviceToken,
};
