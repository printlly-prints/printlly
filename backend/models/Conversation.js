const mongoose = require("mongoose");

// One customer-support thread. There is exactly ONE per customer, ever -
// support here is a single ongoing conversation with the platform, not a
// ticket queue, so customer_id is unique and the thread is created
// lazily the first time either side needs it (see
// getOrCreateConversation in utils/supportMessaging.js).
//
// The two unread counters are denormalised onto this document rather
// than derived by counting unread Messages. The admin list view shows a
// badge per conversation and is polled/re-rendered constantly; counting
// messages for every row on every load would be a query per row for a
// number that only ever changes when a message is sent or a thread is
// opened.
const conversationSchema = new mongoose.Schema({
  customer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  // Drives the admin list's sort order: the thread that spoke most
  // recently is the one that most likely needs an answer. Set on every
  // send, by both sides.
  last_message_at: {
    type: Date,
    default: Date.now,
  },
  unread_by_admin: {
    type: Number,
    default: 0,
    min: 0,
  },
  unread_by_customer: {
    type: Number,
    default: 0,
    min: 0,
  },
});

// Matches the admin list route exactly: every conversation, most
// recently active first.
conversationSchema.index({ last_message_at: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
