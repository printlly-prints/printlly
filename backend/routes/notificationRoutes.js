const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerDeviceToken,
  unregisterDeviceToken,
} = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/auth");

// Any logged-in user can read their own notifications - not role-
// restricted, since nothing here depends on being a customer specifically
// beyond the fact that only customers currently ever have any created.
router.get("/", verifyToken, getNotifications);

// Push-notification device registration. Authenticated, and the owner is
// taken from the token rather than the body - see the controller.
router.post("/device-token", verifyToken, registerDeviceToken);
router.delete("/device-token", verifyToken, unregisterDeviceToken);
router.patch("/read-all", verifyToken, markAllNotificationsRead);
router.patch("/:id/read", verifyToken, markNotificationRead);

module.exports = router;
