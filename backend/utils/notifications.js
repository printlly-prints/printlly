const Notification = require("../models/Notification");
const { sendTransactionalEmail } = require("./email");
const { trackEvent, EVENTS } = require("./analytics");

// Order-event notification copy and delivery used to live here. It now lives
// in utils/orderEvents.js, which is the one place an order state change fans
// out to the customer across all three channels - the in-app record, the
// Socket.io event and the push. Keeping a second function here that created
// only the record would have meant two ways to notify about the same event,
// and eventually one of them being updated and not the other.
//
// What remains is the shop-verification family, which is not an order event:
// it is an admin decision about a vendor's shop, with no order and no realtime
// or push component.

// Copy for the vendor-facing family. Unlike NOTIFICATION_COPY above
// (which is a function of the shop name, written for a customer), these
// address the shop OWNER about their own shop, so the shop name reads as
// "your shop" context rather than a third party.
const SHOP_NOTIFICATION_COPY = {
  shop_approved: (shopName) => ({
    title: "Shop approved",
    body: `${shopName} has been verified and is now visible to customers. You can start taking orders.`,
  }),
  shop_rejected: (shopName, reason) => ({
    title: "Verification rejected",
    body: reason
      ? `${shopName} wasn't approved: ${reason} You can resubmit your documents from your shop profile.`
      : `${shopName} wasn't approved. You can resubmit your documents from your shop profile.`,
  }),
};

// Creates an in-app notification for a SHOP OWNER when an admin approves
// or rejects their shop (PATCH /admin/shops/:id/verify). Never throws -
// never throws - a notification failing to save must never turn a completed
// verification decision into a failed request.
//
// Takes the already-loaded shop rather than an id, since every caller has
// one in hand at this point, and reads owner_id off it for the recipient.
async function notifyShopVerification(shop, type, rejectionReason) {
  try {
    const build = SHOP_NOTIFICATION_COPY[type];
    if (!build) {
      throw new Error(`unknown shop notification type "${type}"`);
    }

    const copy = build(shop.shop_name || "Your shop", rejectionReason);
    await Notification.create({
      user_id: shop.owner_id,
      title: copy.title,
      body: copy.body,
      type,
      shop_id: shop._id,
    });

    // Email, on the same event, from the same place - for the reason
    // utils/orderEvents.js gives for doing its own emailing inline: two
    // triggers for one business event eventually disagree about what
    // happened.
    //
    // This one matters more than most. A vendor who has submitted
    // verification documents is waiting on a decision they cannot see
    // without opening the dashboard, and the in-app notification only
    // reaches them if they do. Approval means they can start trading;
    // rejection means they need to resubmit. Email is the channel that
    // actually finds them.
    //
    // dedupeId is the shop id plus the decision, not the shop id alone: a
    // shop legitimately goes rejected -> resubmitted -> approved, and keying
    // on the shop would suppress every decision after the first.
    await sendTransactionalEmail({
      event: type, // "shop_approved" | "shop_rejected" - the template names
      userId: shop.owner_id,
      params: {
        shopName: shop.shop_name || "Your shop",
        reason: rejectionReason || "",
        vendorName: "there",
      },
      shopId: shop._id,
      dedupeId: String(shop._id) + ":" + type,
    });

    // Only the approval is tracked. A rejection is an internal review
    // outcome rather than a product-funnel step, and counting it would
    // make the vendor-onboarding funnel read as though shops were dropping
    // out when in fact they were resubmitting.
    if (type === "shop_approved") {
      trackEvent({
        event: EVENTS.SHOP_VERIFIED,
        userId: shop.owner_id,
        properties: { shop_id: String(shop._id), role: "shop_owner", source: "backend" },
      });
    }
  } catch (error) {
    console.error(
      `[notifications] failed to create "${type}" notification for shop ${shop?._id}: ${error.message}`
    );
  }
}

module.exports = { notifyShopVerification };
