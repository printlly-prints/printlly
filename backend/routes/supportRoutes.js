const express = require("express");
const router = express.Router();
const {
  getMyConversation,
  postMyMessage,
  markMyConversationRead,
} = require("../controllers/supportController");
const { verifyToken, requireRole } = require("../middleware/auth");

// The customer's own support thread. Auth is applied once to the whole
// router, same as adminRoutes.js: every route here acts on "my"
// conversation, which is only meaningful for a logged-in customer, and a
// route added later inherits the restriction rather than depending on
// whoever adds it remembering to repeat it.
//
// Restricted to customers specifically, not just any logged-in user:
// support connects customers to the platform, and a shop owner's
// questions go through vendor channels. Without requireRole a vendor
// would silently get a thread of their own that no admin screen lists.
router.use(verifyToken, requireRole("customer"));

// Get-or-create, so the app can open the support screen in one request
// without a separate "start a conversation" step. ?before=<ISO date>
// pages further back through history.
router.get("/conversation", getMyConversation);

// The REST twin of the socket's 'support:send'. Same persistence, same
// broadcast - see utils/supportMessaging.js.
router.post("/conversation/messages", postMyMessage);

router.patch("/conversation/read", markMyConversationRead);

module.exports = router;
