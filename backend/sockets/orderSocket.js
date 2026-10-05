const mongoose = require("mongoose");
const Order = require("../models/Order");
const Shop = require("../models/Shop");
const { orderRoom } = require("../config/socket");

// Opt-in subscription to a single order's events.
//
// The authorisation rule, and the reason this handler exists at all: the room
// name is "order:<id>", and a client asking to join one is asking to receive
// everything that happens to that order. The room name is therefore NOT
// treated as authorisation - it is treated as a request, and ownership is
// checked against the database before the join happens.
//
// socket.user was set during the handshake (config/socket.js) by the same
// session-backed authenticateToken the REST API uses, so identity here is
// already established and nothing in the payload is allowed to assert it.
//
// Most clients never need this: a customer already receives their own order
// events in user:<id>, and a vendor receives their shop's in shop:<id>. This
// is for a client watching one order closely - an order detail screen - and
// for admins, who are in neither of those rooms.
function respond(ack, result) {
  if (typeof ack === "function") ack(result);
}

// Whether this socket may watch this order. Returns the order when allowed,
// null otherwise - and deliberately returns null for "not found" as well as
// "not yours", so a caller cannot probe which order ids exist.
async function authoriseOrder(socket, orderId) {
  if (!orderId || !mongoose.isValidObjectId(orderId)) return null;

  const order = await Order.findById(orderId).select("customer_id shop_id").lean();
  if (!order) return null;

  // The customer who placed it.
  if (socket.user.role === "customer") {
    return String(order.customer_id) === socket.user.id ? order : null;
  }

  // The owner of the shop fulfilling it. Checked by loading the shop and
  // comparing its owner - a vendor cannot be authorised for an order whose
  // shop they do not own.
  if (socket.user.role === "shop_owner") {
    const shop = await Shop.findById(order.shop_id).select("owner_id").lean();
    return shop && String(shop.owner_id) === socket.user.id ? order : null;
  }

  // Admins can already read any order through the admin API
  // (routes/adminRoutes.js is admin-only at the router level), so allowing
  // them to watch one grants nothing they did not have. This mirrors the
  // existing authorisation model rather than widening it.
  if (socket.user.role === "admin") return order;

  return null;
}

function registerOrderHandlers(io, socket) {
  socket.on("order:subscribe", async (payload, ack) => {
    try {
      const orderId = payload?.orderId;
      const order = await authoriseOrder(socket, orderId);

      if (!order) {
        // One message for every refusal - unknown id, malformed id, someone
        // else's order - so this cannot be used to enumerate orders.
        return respond(ack, { ok: false, message: "You do not have access to this order" });
      }

      socket.join(orderRoom(orderId));
      respond(ack, { ok: true, room: orderRoom(orderId) });
    } catch (error) {
      console.error(`[orderSocket] subscribe failed: ${error.message}`);
      // Fail closed: an unknown authorisation state is not a join.
      respond(ack, { ok: false, message: "Could not subscribe to this order" });
    }
  });

  socket.on("order:unsubscribe", (payload, ack) => {
    const orderId = payload?.orderId;
    if (orderId && mongoose.isValidObjectId(orderId)) socket.leave(orderRoom(orderId));
    // Unconditionally ok: leaving a room you were never in is not an error,
    // and reporting one would tell the caller something about the room.
    respond(ack, { ok: true });
  });
}

module.exports = { registerOrderHandlers, authoriseOrder };
