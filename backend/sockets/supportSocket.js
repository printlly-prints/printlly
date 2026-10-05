const mongoose = require("mongoose");
const { customerRoom } = require("../config/socket");
const {
  SupportError,
  sendSupportMessage,
  markConversationRead,
} = require("../utils/supportMessaging");

// Socket handlers for customer support. These are thin on purpose -
// every one of them just works out WHICH conversation the caller is
// allowed to act on and then hands off to utils/supportMessaging.js,
// which is the same code the REST routes call.
//
// socket.user was set during the handshake (config/socket.js) and is the
// only thing trusted for identity here. Nothing in an event payload is
// allowed to say who the sender is.

// Which customer's thread this socket is acting on. A customer can only
// ever act on their own, whatever they send; an admin must name one.
function targetCustomerId(socket, payload) {
  if (socket.user.role === "customer") return socket.user.id;
  if (socket.user.role === "admin") {
    const id = payload?.customerId;
    return id && mongoose.isValidObjectId(id) ? String(id) : null;
  }
  // Shop owners have no support thread - this feature connects customers
  // to the platform, and a vendor arriving here is a mistake, not a
  // silent no-op.
  return null;
}

// Every handler replies through an optional ack callback rather than an
// 'error' event, so a client can tell WHICH send failed. Clients that
// pass no callback simply don't hear back, which is fine for fire-and-
// forget cases like mark_read.
function respond(ack, result) {
  if (typeof ack === "function") ack(result);
}

function registerSupportHandlers(io, socket) {
  // An admin joins one conversation room while they have that thread
  // open, and leaves it when they move on. They stay in admin:support
  // the whole time regardless (joined at connection), so leaving here
  // costs them nothing but the live message stream for a thread they are
  // no longer looking at.
  socket.on("support:open", async (payload, ack) => {
    if (socket.user.role !== "admin") {
      return respond(ack, { ok: false, message: "Only an admin opens a conversation this way" });
    }
    const customerId = targetCustomerId(socket, payload);
    if (!customerId) return respond(ack, { ok: false, message: "A valid customerId is required" });

    // Leave whichever thread was open before, so an admin clicking
    // through a list doesn't accumulate rooms and start receiving
    // messages for every conversation they have ever glanced at.
    for (const room of socket.rooms) {
      if (room.startsWith("support:") && room !== customerRoom(customerId)) socket.leave(room);
    }
    socket.join(customerRoom(customerId));
    respond(ack, { ok: true });
  });

  socket.on("support:close", (payload) => {
    if (socket.user.role !== "admin") return;
    const customerId = targetCustomerId(socket, payload);
    if (customerId) socket.leave(customerRoom(customerId));
  });

  socket.on("support:send", async (payload, ack) => {
    const customerId = targetCustomerId(socket, payload);
    if (!customerId) {
      return respond(ack, { ok: false, message: "Not allowed to send on this conversation" });
    }

    try {
      const { message } = await sendSupportMessage({
        customerId,
        senderRole: socket.user.role,
        senderId: socket.user.id,
        text: payload?.text,
        orderContext: payload?.order_context,
      });
      // The broadcast has already gone out to the room this socket is in,
      // so the sender sees their own message through the same path as
      // everyone else - one rendering path, not two. The ack only
      // confirms it was accepted.
      respond(ack, { ok: true, message_id: message._id });
    } catch (error) {
      if (error instanceof SupportError) {
        return respond(ack, { ok: false, message: error.message });
      }
      console.error(`Socket support:send failed: ${error.message}`);
      respond(ack, { ok: false, message: "Failed to send message" });
    }
  });

  socket.on("support:mark_read", async (payload, ack) => {
    const customerId = targetCustomerId(socket, payload);
    if (!customerId) return respond(ack, { ok: false, message: "Not allowed" });

    try {
      const conversation = await markConversationRead(customerId, socket.user.role);
      respond(ack, { ok: true, conversation });
    } catch (error) {
      console.error(`Socket support:mark_read failed: ${error.message}`);
      respond(ack, { ok: false, message: "Failed to mark as read" });
    }
  });
}

module.exports = { registerSupportHandlers };
