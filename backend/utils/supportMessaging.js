const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Order = require("../models/Order");
const { getIo, customerRoom, ADMIN_ROOM } = require("../config/socket");

const MAX_MESSAGE_LENGTH = 2000;

// Everything below is the SINGLE implementation of sending a support
// message. Both entry points call it: the socket handler
// (sockets/supportSocket.js) and the REST handlers
// (controllers/supportController.js). They differ only in how the
// request arrives and how a failure is reported back - a socket ack
// versus an HTTP status - so that is all their own code does.
//
// Keeping it in one place is the whole point: the persistence, the
// unread bookkeeping and the broadcast have to happen together and in
// that order, and a message sent over REST has to reach a socket-
// connected recipient exactly as if it had been sent over the socket.
// Two copies of this would drift the first time one of those three
// steps changed.

// A thrown SupportError carries the status the REST layer should use;
// the socket layer reports the same message through its ack instead.
class SupportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Exactly one conversation per customer, created on first contact from
// either side. Written as an upsert rather than find-then-create because
// two near-simultaneous first messages (the customer's app retrying, say)
// would otherwise both find nothing and both insert, and customer_id is
// unique - the second would throw. $setOnInsert means a second caller
// simply gets the first one's document back.
async function getOrCreateConversation(customerId) {
  return Conversation.findOneAndUpdate(
    { customer_id: customerId },
    { $setOnInsert: { customer_id: customerId, created_at: new Date(), last_message_at: new Date() } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function normalizeText(rawText) {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text) {
    throw new SupportError(400, "Message text is required");
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new SupportError(400, `A message can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return text;
}

// The order behind a "need help with this order" message is resolved
// HERE, from the order id alone - the shop name the client sent (if any)
// is deliberately ignored. A client-supplied shop name is unverified
// text that would then be shown to an admin as though it were the
// platform's own record, and an admin acting on a support thread needs
// to be able to trust which shop it is about.
//
// The order must also belong to this conversation's customer. Without
// that check any customer could attach any order id and have the admin
// panel show them another customer's order alongside their complaint.
async function resolveOrderContext(rawContext, customerId) {
  if (rawContext === undefined || rawContext === null) return null;

  const orderId = rawContext.order_id;
  if (!orderId || !mongoose.isValidObjectId(orderId)) {
    throw new SupportError(400, "order_context.order_id must be a valid order id");
  }

  const order = await Order.findOne({ _id: orderId, customer_id: customerId })
    .populate("shop_id", "shop_name")
    .lean();
  if (!order) {
    throw new SupportError(404, "That order was not found for this customer");
  }

  return {
    order_id: order._id,
    // Snapshotted, so the thread still names the right shop after a
    // rename - and still reads correctly if the order is later deleted.
    shop_name: order.shop_id?.shop_name || "",
  };
}

// Persists the message, moves the conversation's unread counter for the
// side that ISN'T sending, and broadcasts.
//
// `customerId` identifies the thread in both directions: for a customer
// it is the sender, for an admin it is who they are replying to.
async function sendSupportMessage({ customerId, senderRole, senderId, text, orderContext }) {
  const body = normalizeText(text);
  const conversation = await getOrCreateConversation(customerId);
  const context = await resolveOrderContext(orderContext, customerId);

  const message = await Message.create({
    conversation_id: conversation._id,
    sender_role: senderRole,
    sender_id: senderId,
    text: body,
    order_context: context,
  });

  // $inc rather than read-modify-write: two messages arriving at once
  // would otherwise both read the same count and both store count+1,
  // losing one of them from the badge.
  const unreadField = senderRole === "customer" ? "unread_by_admin" : "unread_by_customer";
  const updated = await Conversation.findByIdAndUpdate(
    conversation._id,
    { $set: { last_message_at: message.created_at }, $inc: { [unreadField]: 1 } },
    { new: true }
  );

  broadcastMessage({ customerId: String(customerId), message, conversation: updated });

  return { message, conversation: updated };
}

// Best-effort, deliberately: the message is already saved by the time
// this runs, so a missing io (a script that never booted the server) or
// a room with nobody in it must not turn a successful send into a
// failure. Whoever wasn't listening picks the message up from the REST
// history the next time they open the thread - which is exactly what
// that history is for.
function broadcastMessage({ customerId, message, conversation }) {
  const io = getIo();
  if (!io) return;

  const payload = {
    _id: message._id,
    conversation_id: message.conversation_id,
    sender_role: message.sender_role,
    sender_id: message.sender_id,
    text: message.text,
    order_context: message.order_context || null,
    created_at: message.created_at,
  };

  // To whoever currently has this thread open - the customer always, and
  // any admin who has opened it.
  io.to(customerRoom(customerId)).emit("support:message", payload);

  // And a light notification to every connected admin, open thread or
  // not, so unread badges move without subscribing each admin to every
  // conversation on the platform. Truncated, because this is for a badge
  // and a one-line preview, not for reading.
  io.to(ADMIN_ROOM).emit("support:notification", {
    customerId,
    preview: message.text.length > 120 ? `${message.text.slice(0, 120)}...` : message.text,
    sender_role: message.sender_role,
    unread_by_admin: conversation?.unread_by_admin ?? 0,
    last_message_at: message.created_at,
  });
}

// Clears the unread counter for the side that just looked at the thread.
// $set to 0 (not a decrement) because "I have read this" is an absolute
// statement about the whole thread, not a relative one.
async function markConversationRead(customerId, role) {
  const field = role === "admin" ? "unread_by_admin" : "unread_by_customer";
  return Conversation.findOneAndUpdate(
    { customer_id: customerId },
    { $set: { [field]: 0 } },
    { new: true }
  );
}

module.exports = {
  SupportError,
  MAX_MESSAGE_LENGTH,
  getOrCreateConversation,
  sendSupportMessage,
  markConversationRead,
};
