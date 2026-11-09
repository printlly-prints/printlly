const Shop = require("../models/Shop");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIo, userRoom, shopRoom, orderRoom } = require("../config/socket");
const { sendPushToUser } = require("./pushNotifications");
const { sendTransactionalEmail, orderRef } = require("./email");
const { trackEvent, EVENTS } = require("./analytics");

// The single place an order state change fans out to the people who care.
//
// ARCHITECTURE, and the one rule that matters:
//
//   authoritative business operation
//           |
//   database state change COMMITTED
//           |
//   emitOrderEvent()  <- only ever called after the save succeeded
//      |        |        |
//   Socket.io  push   Notification record
//
// The database is the source of truth; this is delivery. Every branch below
// is best-effort and the whole function swallows its own errors, because an
// order is accepted whether or not the customer's phone can be reached. If
// Socket.io is down, or Expo is down, or the notification write fails, the
// order stays accepted - the notification layer is downstream of the business
// operation, never part of deciding whether it succeeded.
//
// Nothing here is emitted speculatively. Controllers call this AFTER
// order.save() has resolved, never on receiving a request.

// Event names, in one place so a client cannot be listening for a string the
// server never sends.
//
// Only events for states that exist in models/Order.js
// (pending | accepted | ready_for_pickup | completed | cancelled | expired)
// and payment_status (created | paid | failed). No new states were invented.
const ORDER_EVENTS = {
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  ORDER_ACCEPTED: "ORDER_ACCEPTED",
  ORDER_READY_FOR_PICKUP: "ORDER_READY_FOR_PICKUP",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  ORDER_EXPIRED: "ORDER_EXPIRED",
};

// There is deliberately no ORDER_CREATED.
//
// An order is created BEFORE payment (POST /orders leaves payment_status
// "created"), and a vendor never sees an unpaid order - getOrdersForShop
// filters on payment_status. So "a new order arrived" for a vendor is exactly
// PAYMENT_CONFIRMED, and emitting ORDER_CREATED as well would either tell
// vendors about orders they cannot act on or duplicate the paid event. The
// customer, meanwhile, is the one who just pressed the button; they do not
// need telling.

// Who hears what, and the in-app notification type each event maps to.
//
// notification_type reuses the EXISTING Notification enum
// (models/Notification.js) rather than introducing a second notification
// model - the records, the GET /notifications route and the unread handling
// all already work.
//
// notify_customer false means no in-app record and no push: the vendor does
// not need a notification telling them they accepted their own order.
const EVENT_MAP = {
  [ORDER_EVENTS.PAYMENT_CONFIRMED]: {
    notification_type: "payment_success",
    notify_customer: true,
    // The vendor's "new paid order" signal - the first moment the order is
    // real work for them.
    notify_shop: true,
  },
  [ORDER_EVENTS.PAYMENT_FAILED]: {
    notification_type: "payment_failed",
    notify_customer: true,
    // A payment that never completed is not work arriving, so the shop is
    // not told about it.
    notify_shop: false,
  },
  [ORDER_EVENTS.ORDER_ACCEPTED]: {
    notification_type: "order_accepted",
    notify_customer: true,
    notify_shop: false,
  },
  [ORDER_EVENTS.ORDER_READY_FOR_PICKUP]: {
    notification_type: "order_ready",
    notify_customer: true,
    notify_shop: false,
  },
  [ORDER_EVENTS.ORDER_COMPLETED]: {
    notification_type: "order_completed",
    notify_customer: true,
    // The shop's own queue shrinks, which its dashboard cares about.
    notify_shop: true,
  },
  [ORDER_EVENTS.ORDER_EXPIRED]: {
    notification_type: "order_expired",
    notify_customer: true,
    notify_shop: true,
  },
};

// The socket payload. Minimal on purpose.
//
// NOT included, and each for a reason: the documents array (file URLs - a
// push payload passes through Apple's and Google's servers and shows on a
// lock screen), the pickup OTP (it is the one secret that proves the customer
// is present at the counter; putting it in a notification would defeat it),
// the customer's phone or address, the pricing breakdown, and the Mongo
// document itself. A client that needs more calls GET /orders/customer, which
// already authorises the read.
function socketPayload(order, event) {
  return {
    event,
    orderId: String(order._id),
    status: order.status,
    paymentStatus: order.payment_status,
    timestamp: new Date().toISOString(),
  };
}

// Resolves the shop name for the notification copy without assuming whether
// the caller handed us a populated shop or a bare id.
async function resolveShopName(order) {
  if (order.shop_id && typeof order.shop_id === "object" && order.shop_id.shop_name) {
    return { name: order.shop_id.shop_name, ownerId: order.shop_id.owner_id || null, id: order.shop_id._id };
  }
  const shop = await Shop.findById(order.shop_id).select("shop_name owner_id").lean();
  return {
    name: shop?.shop_name || "the shop",
    ownerId: shop?.owner_id || null,
    id: order.shop_id,
  };
}

// Customer-facing copy. Kept here beside the event definitions rather than in
// utils/notifications.js because these three channels must say the same thing
// about the same event - that is the whole point of one event service.
const COPY = {
  payment_success: (shopName) => ({
    title: "Payment successful",
    body: `Your payment for the order at ${shopName} was received. Your pickup code is ready - check your order for details.`,
  }),
  payment_failed: (shopName) => ({
    title: "Payment failed",
    body: `Your payment for the order at ${shopName} didn't go through. If money was deducted it will be refunded automatically - you can try paying again.`,
  }),
  order_accepted: (shopName) => ({
    title: "Order accepted",
    body: `${shopName} has accepted your print order.`,
  }),
  order_ready: (shopName) => ({
    title: "Ready for pickup",
    body: `Your order is ready for pickup at ${shopName}.`,
  }),
  order_completed: (shopName) => ({
    title: "Order completed",
    body: `Your order from ${shopName} has been collected. Thanks for using us!`,
  }),
  order_expired: (shopName) => ({
    title: "Order expired",
    body: `Your order at ${shopName} expired because it wasn't completed in time. Its documents were deleted - you're welcome to place a new order.`,
  }),
};

// ---------------------------------------------------------------------------
// Email, as a FOURTH channel on the same fan-out
// ---------------------------------------------------------------------------
//
// Added here rather than in each controller for exactly the reason the other
// three channels are here: four delivery paths triggered from four places is
// four chances for one to say something the others do not.
//
// Which order events produce which emails. Note that PAYMENT_CONFIRMED
// produces TWO - the customer's confirmation and the shop's "new paid order"
// - which is the same asymmetry EVENT_MAP already encodes for sockets, and
// for the same reason: payment is the moment an order becomes real work.
//
// Events absent from this table deliberately send no email. ORDER_ACCEPTED
// has no vendor email because the vendor is the one who pressed accept.
const EMAIL_MAP = {
  [ORDER_EVENTS.PAYMENT_CONFIRMED]: { customer: "order_confirmed", vendor: "vendor_new_order" },
  [ORDER_EVENTS.PAYMENT_FAILED]: { customer: "payment_failed" },
  [ORDER_EVENTS.ORDER_ACCEPTED]: { customer: "order_accepted" },
  [ORDER_EVENTS.ORDER_READY_FOR_PICKUP]: { customer: "order_ready" },
  [ORDER_EVENTS.ORDER_COMPLETED]: { customer: "order_completed" },
  [ORDER_EVENTS.ORDER_EXPIRED]: { customer: "order_expired" },
};

// Which order events are worth a product-analytics event, and under whose
// identity.
//
// Only transitions the SERVER can state authoritatively appear here. The
// client-side funnel events (payment_started, shop_viewed) are emitted by the
// apps, because the server never sees them - see utils/analytics.js for why
// that split is deliberate rather than incidental.
const ANALYTICS_MAP = {
  [ORDER_EVENTS.PAYMENT_CONFIRMED]: { event: EVENTS.PAYMENT_COMPLETED, subject: "customer" },
  [ORDER_EVENTS.PAYMENT_FAILED]: { event: EVENTS.PAYMENT_FAILED, subject: "customer" },
  [ORDER_EVENTS.ORDER_ACCEPTED]: { event: EVENTS.ORDER_ACCEPTED, subject: "vendor" },
  [ORDER_EVENTS.ORDER_READY_FOR_PICKUP]: { event: EVENTS.ORDER_READY, subject: "customer" },
  [ORDER_EVENTS.ORDER_COMPLETED]: { event: EVENTS.ORDER_COMPLETED, subject: "customer" },
  [ORDER_EVENTS.ORDER_EXPIRED]: { event: EVENTS.ORDER_EXPIRED, subject: "customer" },
};

// Sends whatever emails this event calls for.
//
// Deduplication is NOT this function's job and is deliberately not gated on
// the in-app notification having been created. utils/email.js holds its own
// durable per-(event, order) record (models/EmailDelivery.js), which is a
// stronger guarantee than reusing the notification insert: if the
// notification write failed for some reason other than a duplicate, the
// customer should still be emailed.
//
// Never throws. Each send already swallows its own failures, and the whole
// block is wrapped again because an email must never affect an order.
async function deliverEmailsFor(order, event, shop) {
  const mapping = EMAIL_MAP[event];
  if (!mapping) return { customer: null, vendor: null };

  const result = { customer: null, vendor: null };

  try {
    // The recipient's name, for the greeting. Fetched here rather than
    // threaded through every caller, and only when there is actually an
    // email to send.
    const customer = await User.findById(order.customer_id).select("name").lean();

    const params = {
      customerName: (customer && customer.name) || "there",
      vendorName: "there",
      shopName: shop.name,
      orderRef: orderRef(order._id),
      amount: order.total_amount,
      vendorAmount: order.vendor_amount,
    };

    if (mapping.customer) {
      const outcome = await sendTransactionalEmail({
        event: mapping.customer,
        userId: order.customer_id,
        params,
        orderId: order._id,
      });
      result.customer = outcome.outcome;
    }

    if (mapping.vendor && shop.ownerId) {
      const owner = await User.findById(shop.ownerId).select("name").lean();
      const outcome = await sendTransactionalEmail({
        event: mapping.vendor,
        userId: shop.ownerId,
        params: { ...params, vendorName: (owner && owner.name) || "there" },
        orderId: order._id,
        shopId: shop.id,
        // The customer's email for this order is keyed on the order id
        // alone, so the vendor's needs its own dedupe subject or the second
        // send would be refused as a duplicate of the first.
        dedupeId: String(order._id),
      });
      result.vendor = outcome.outcome;
    }
  } catch (error) {
    console.error(`[orderEvents] email dispatch failed for order ${order._id}: ${error.message}`);
  }

  return result;
}

// Records the product-analytics event. Synchronous and non-blocking:
// trackEvent only buffers, so this adds no latency and cannot fail a request.
function trackOrderEvent(order, event, shop) {
  const mapping = ANALYTICS_MAP[event];
  if (!mapping) return false;

  const subjectId = mapping.subject === "vendor" ? shop.ownerId : order.customer_id;
  if (!subjectId) return false;

  return trackEvent({
    event: mapping.event,
    userId: subjectId,
    properties: {
      order_id: String(order._id),
      shop_id: shop.id ? String(shop.id) : undefined,
      status: order.status,
      payment_status: order.payment_status,
      total_amount: order.total_amount,
      source: "backend",
    },
  });
}

// Creates the in-app record, exactly once per (order, event type).
//
// Idempotency is enforced by a unique index on {order_id, type}
// (models/Notification.js), not by checking first: an idempotent webhook
// redelivery, a retried controller or two concurrent calls would all pass a
// read-then-write check. A duplicate-key error here is the success case
// meaning "already recorded", so it is swallowed rather than logged as a
// failure.
//
// Returns true if this call created the record - which is also what decides
// whether a push is sent, so a redelivered event cannot re-notify a phone.
async function createNotificationOnce({ userId, type, orderId, title, body }) {
  try {
    await Notification.create({ user_id: userId, title, body, type, order_id: orderId });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    // Any other failure must not stop the socket emit or the push.
    console.error(`[orderEvents] notification write failed for order ${orderId}: ${error.message}`);
    return false;
  }
}

// Emits one order event across all three channels.
//
// Call this ONLY after the state change is committed. Never throws.
async function emitOrderEvent(order, event) {
  try {
    const config = EVENT_MAP[event];
    if (!config) {
      console.error(`[orderEvents] unknown event "${event}" for order ${order?._id}`);
      return { emitted: false };
    }

    const shop = await resolveShopName(order);
    const payload = socketPayload(order, event);
    const result = { emitted: true, notified: false, pushed: null, sockets: [] };

    // ---- Socket.io: live sessions only ----
    //
    // Wrapped because getIo() returns null when the socket server was never
    // started - a script loading a controller, or a test - and because a
    // delivery failure here must not propagate.
    try {
      const io = getIo();
      if (io) {
        // The customer's own room. Scoped by user id, so no customer can
        // receive another customer's order events.
        io.to(userRoom(order.customer_id)).emit("order:event", payload);
        result.sockets.push("customer");

        if (config.notify_shop && shop.ownerId) {
          // The shop room, which only that shop's owner is joined to (see
          // config/socket.js) - never a global broadcast.
          io.to(shopRoom(shop.id)).emit("order:event", payload);
          result.sockets.push("shop");
        }

        // Anyone watching this specific order, having proved they own it.
        io.to(orderRoom(order._id)).emit("order:event", payload);
      }
    } catch (error) {
      console.error(`[orderEvents] socket emit failed for order ${order._id}: ${error.message}`);
    }

    // ---- in-app record + push, for the customer ----
    if (config.notify_customer) {
      const copy = COPY[config.notification_type](shop.name);
      const created = await createNotificationOnce({
        userId: order.customer_id,
        type: config.notification_type,
        orderId: order._id,
        title: copy.title,
        body: copy.body,
      });
      result.notified = created;

      // Only on a first-time record. This is what stops a duplicate webhook
      // delivery or a retried controller from buzzing the customer's phone
      // twice for one business event.
      if (created) {
        result.pushed = await sendPushToUser(order.customer_id, {
          title: copy.title,
          body: copy.body,
          // Ids only - enough for the app to open the right order.
          data: { event, orderId: String(order._id), type: config.notification_type },
        });
      }
    }

    // ---- email ----
    //
    // Last of the four channels on purpose. Socket.io and push are what reach
    // a customer within seconds and are what the product's UX depends on;
    // email is the durable record that arrives whether or not the app was
    // open. Running it last means a slow mail provider delays nothing that
    // matters, and its own failures are already contained.
    result.emails = await deliverEmailsFor(order, event, shop);

    // ---- product analytics ----
    //
    // Buffered, not sent: this is a function call into an in-memory queue
    // that a background interval flushes, so it costs nothing here.
    result.tracked = trackOrderEvent(order, event, shop);

    console.log(
      `[orderEvents] ${JSON.stringify({
        event,
        order_id: String(order._id),
        status: order.status,
        payment_status: order.payment_status,
        notification_created: result.notified,
        push: result.pushed ? `${result.pushed.sent} sent/${result.pushed.failed} failed` : "not attempted",
        sockets: result.sockets,
        email: result.emails,
        analytics: result.tracked,
        timestamp: new Date().toISOString(),
      })}`
    );

    return result;
  } catch (error) {
    // The outermost guard. Nothing about notifying anyone may surface as a
    // failure of the operation that triggered it.
    console.error(`[orderEvents] emit failed for order ${order?._id}: ${error.message}`);
    return { emitted: false };
  }
}

module.exports = {
  emitOrderEvent,
  ORDER_EVENTS,
  EVENT_MAP,
  EMAIL_MAP,
  ANALYTICS_MAP,
  socketPayload,
  deliverEmailsFor,
  trackOrderEvent,
};
