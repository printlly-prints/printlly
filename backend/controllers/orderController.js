const Order = require("../models/Order");
const Shop = require("../models/Shop");
const Upload = require("../models/Upload");
const { getPricingSettings, computeOrderPricing } = require("../utils/pricing");
const { normalizeDocumentList } = require("../utils/orderDocuments");
const { findServiceByExactName, resolveDocumentServices } = require("../utils/shopServices");
const { deleteOrderDocuments } = require("../utils/documentCleanup");
// One event service for all three delivery channels (socket, push, in-app
// record) - see utils/orderEvents.js. Each call below happens only AFTER the
// state change has been saved.
const { emitOrderEvent, ORDER_EVENTS } = require("../utils/orderEvents");
const { attachQueuePosition } = require("../utils/queue");
const { computeEffectiveOpenStatus } = require("../utils/shopStatus");
// Shared with the admin list routes (controllers/adminController.js) so
// every paginated list in the API behaves identically - see utils/pagination.js.
const { parsePagination } = require("../utils/pagination");
const { trackEvent, EVENTS } = require("../utils/analytics");

// POST /orders
// Customer places a new print order at a chosen shop, bundling one or
// more previously-uploaded documents. The order is created with
// payment_status "created" and no otp - see POST /payments/razorpay/verify
// in paymentController.js, which is the only place either of those ever
// changes. The client gets back order_id + total_amount and is expected
// to immediately call POST /payments/razorpay/create-order next.
//
// PRICING SECURITY: page count and every price component are computed
// here from the Upload records, the ordering shop's own `pricing`
// sub-document, and (for platform_fee only) the live Settings document -
// never taken from the request body, even if the client sends them. A
// client can request paper_size/sides/services (they change what gets
// printed), but never their prices - req.body has no price fields read
// anywhere below. A client can only ever influence the total indirectly,
// by choosing which of ITS OWN uploads, how many copies, and which
// add-ons (and only add-ons the shop actually offers - see the
// service resolution below).
//
// BODY SHAPE: { shop_id, instructions, documents: [{ upload_id,
// color_mode, copies, paper_size, sides, services }] }, where `services`
// is an array of service NAMES as this shop lists them, e.g.
// ["Matte Lamination"]. Print settings are per document - one order can
// hold a B&W handout and a laminated colour poster.
const createOrder = async (req, res) => {
  try {
    const { shop_id, documents, instructions } = req.body;

    if (!shop_id || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        message: "shop_id and documents (a non-empty array) are required",
      });
    }

    // Each entry carries its own upload_id AND its own print settings -
    // colour mode, copies, paper size, sides and services are per
    // document, not per order.
    const uploadIds = documents.map((doc) => doc?.upload_id);
    if (uploadIds.some((id) => !id)) {
      return res.status(400).json({ message: "Every document needs an upload_id" });
    }
    if (new Set(uploadIds.map(String)).size !== uploadIds.length) {
      return res.status(400).json({ message: "The same upload appears twice in documents" });
    }

    const { documents: settingsList, error: settingsError } = normalizeDocumentList(documents);
    if (settingsError) {
      return res.status(400).json({ message: settingsError });
    }

    // !shop.is_active also catches a shop deactivated via PATCH
    // /shops/me/deactivate or the admin equivalent (PATCH /shops/:id/
    // deactivate): a deactivated shop cannot receive a new order any more
    // than an unregistered shop_id can, same 404 either way. It says
    // nothing about orders already placed at that shop before it
    // deactivated - those are untouched.
    const shop = await Shop.findById(shop_id);
    if (!shop || !shop.is_active) {
      return res.status(404).json({ message: "Shop not found or inactive" });
    }

    // is_active/verification_status control whether a shop is listed at
    // all; this is the separate, live question of whether it's accepting
    // orders RIGHT NOW - manual toggle and/or business hours, see
    // utils/shopStatus.js. Checked server-side rather than trusting the
    // client to have seen an up-to-date is_currently_open from GET /shops
    // - a shop could close between the customer loading that list and
    // submitting this order.
    if (!computeEffectiveOpenStatus(shop)) {
      return res.status(400).json({ message: "This shop is currently closed" });
    }

    // Each document's requested service NAMES are resolved against this
    // shop's own vendor-defined list, and the matched name + rate are
    // snapshotted onto the document (see utils/shopServices.js). A name
    // the shop doesn't offer is rejected outright rather than silently
    // dropped or priced at 0, which would hand out real work for free.
    //
    // EXACT matching here, not the substring matching compare-pricing
    // uses: by this point the customer has chosen a shop and is looking
    // at that shop's actual service names, so accepting a near-match
    // could charge them for a pricier service than the one they picked.
    //
    // Resolved PER DOCUMENT and reported that way - "this shop does not
    // offer lamination" is useless feedback when only the third of five
    // documents asked for it.
    const resolvedServices = [];
    for (let i = 0; i < settingsList.length; i += 1) {
      const { services, unmatched } = resolveDocumentServices(
        settingsList[i].requested_services,
        shop.pricing,
        findServiceByExactName
      );
      if (unmatched) {
        return res.status(400).json({
          message: `Document ${i + 1}: this shop does not offer "${unmatched}".`,
        });
      }
      resolvedServices.push(services);
    }

    // Validate every upload BEFORE creating anything or marking any of
    // them used, so a bad id partway through the array never leaves a
    // half-created order or an upload wrongly flagged as used.
    //
    // Fetched in ONE query rather than a findById per id (an order can
    // bundle up to 10 documents - see uploadRoutes.js - which was 10
    // sequential round-trips on the single most latency-sensitive request
    // in the app). The checks below still run per id, in the caller's
    // original order, so every rejection message names the exact upload
    // that failed and for the exact reason.
    //
    // .lean() is safe here: only uploader_id/used/page_count/file_url are
    // read, all of which are required-or-always-written, and the
    // documents themselves are never saved through these objects (the
    // used flag is flipped by the updateMany below).
    const uploadDocs = await Upload.find({ _id: { $in: uploadIds } }).lean();
    const uploadsById = new Map(uploadDocs.map((u) => [u._id.toString(), u]));

    const uploads = [];
    for (const uploadId of uploadIds) {
      const upload = uploadsById.get(String(uploadId));
      if (!upload) {
        return res.status(404).json({ message: `Upload ${uploadId} not found. Please upload again.` });
      }
      if (upload.uploader_id.toString() !== req.user.id) {
        return res.status(403).json({ message: `Upload ${uploadId} does not belong to you` });
      }
      if (upload.used) {
        return res.status(400).json({
          message: `Upload ${uploadId} is already attached to another order. Please upload again.`,
        });
      }
      uploads.push(upload);
    }

    // page_count comes from the Upload record (server-computed), never
    // from the request - the client chooses what to print, never how much
    // of it there is.
    const pricingInput = uploads.map((upload, i) => ({
      page_count: upload.page_count,
      ...settingsList[i],
      // The priced snapshot replaces the requested names from here on:
      // rates come from the shop, never from the request.
      services: resolvedServices[i],
    }));

    // Only platform_fee still comes from the global Settings document -
    // every other rate is this shop's own (shop.pricing). Same shared
    // function POST /shops/compare-pricing uses, so the two can never
    // compute a different price for the same inputs.
    const settings = await getPricingSettings();
    const priced = computeOrderPricing({
      documents: pricingInput,
      shopPricing: shop.pricing,
      settings,
    });

    const orderDocuments = uploads.map((upload, i) => {
      // requested_services was the customer's wording; what gets stored is
      // what the shop actually sold them, at the price it sold it for.
      const { requested_services, ...settings } = settingsList[i];
      return {
        upload_id: upload._id,
        file_url: upload.file_url,
        page_count: upload.page_count,
        // Taken from the Upload, never from the request - the same rule
        // as page_count above.
        original_name: upload.original_name,
        ...settings,
        services: resolvedServices[i],
        pricing: priced.documents[i].pricing,
      };
    });

    const order = await Order.create({
      customer_id: req.user.id,
      shop_id,
      documents: orderDocuments,
      instructions,
      base_subtotal: priced.base_subtotal,
      paper_size_charge: priced.paper_size_charge,
      sides_charge: priced.sides_charge,
      services_charge: priced.services_charge,
      platform_fee: priced.platform_fee,
      total_amount: priced.total_amount,
      timeline: [{ event: "placed", actor: "customer" }],
      // payment_status defaults to "created" and otp defaults to null on
      // the schema - neither is set here. See POST /payments/razorpay/verify.
    });

    await Upload.updateMany({ _id: { $in: uploadIds } }, { $set: { used: true } });

    // The full order is returned (not just order_id/total_amount) so
    // consumers get the itemized breakdown, now including each document's
    // own share. otp is null and payment_status is "created" until the
    // client completes POST /payments/razorpay/create-order + verify.
    res.status(201).json(order);

    // The top of the payment funnel, server-side. An order at this point is
    // created but unpaid, which is exactly why it is worth recording: the gap
    // between this event and payment_completed is the checkout drop-off, and
    // it is the one number the product cannot get from the database without
    // this pair.
    //
    // Dimensions only - how many documents, how many pages, what print
    // options. No filenames, no URLs, no instructions text: the shape of the
    // job is a product question, its contents are the customer's.
    trackEvent({
      event: EVENTS.ORDER_CREATED,
      userId: req.user.id,
      properties: {
        order_id: String(order._id),
        shop_id: String(shop_id),
        file_count: orderDocuments.length,
        page_count: orderDocuments.reduce((sum, doc) => sum + (doc.page_count || 0), 0),
        total_amount: order.total_amount,
        platform_fee: order.platform_fee,
        status: order.status,
        payment_status: order.payment_status,
        source: "backend",
      },
    });
  } catch (error) {
    console.error(`Failed to create order: ${error.message}`);
    res.status(500).json({ message: "Failed to create order" });
  }
};

// GET /orders/shop/:shopId
// Shop owner views all orders placed at their shop.
// Ownership check ensures a shop owner can't view another shop's orders.
//
// payment_status: "paid" is a hard filter, not a display preference - an
// order the customer hasn't actually paid for does not exist yet as far
// as the shop is concerned. It has no otp yet either, so nothing here
// would even be actionable if it leaked through.
const getOrdersForShop = async (req, res) => {
  try {
    const { shopId } = req.params;

    // Only owner_id is read here (the ownership check below) - no reason
    // to pull this shop's pricing/photos/kyc into memory for it.
    const shop = await Shop.findById(shopId).select("owner_id");
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    if (shop.owner_id.toString() !== req.user.id) {
      return res.status(403).json({ message: "You do not own this shop" });
    }

    const { limit, skip } = parsePagination(req.query);

    // .lean() is safe on Order (unlike the Shop queries in
    // shopController.js): every field read here is either required at the
    // schema level or written explicitly at creation time, so there are
    // no documents relying on Mongoose backfilling a default on read.
    // These orders are only ever serialized to JSON - no document methods
    // or virtuals are used - so hydrating them buys nothing.
    const orders = await Order.find({ shop_id: shopId, payment_status: "paid" })
      .populate("customer_id", "name phone email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json(orders);
  } catch (error) {
    console.error(`Failed to fetch orders: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// GET /orders/customer
// Customer views their own order history (used by the mobile app's
// "My orders" screen). Scoped to req.user.id so a customer can only
// ever see their own orders.
//
// Unlike the shop-facing list, this one deliberately does NOT filter by
// payment_status - a customer needs to see their own "created" (payment
// pending) and "failed" (payment failed) orders too, so the app can show
// a "Payment pending" / "Payment failed - retry" state instead of the
// order silently vanishing. No projection is applied, so payment_status
// is already present on every order returned here.
//
// Each order also carries queue_position via attachQueuePosition (see
// utils/queue.js - the same helper POST /payments/razorpay/verify uses
// for its own success response, so both agree on exactly when the field
// appears). Computed per order (not batched) since one customer's own
// order list is small; that N+1-avoidance is only worth it for GET
// /shops, which can list many shops at once (see getActiveShops).
const getMyOrders = async (req, res) => {
  try {
    const { limit, skip } = parsePagination(req.query);

    // .lean() for the same reason as getOrdersForShop above - see its
    // comment. attachQueuePosition accepts plain objects as well as
    // documents (see utils/queue.js) precisely so this can be lean while
    // POST /payments/razorpay/verify keeps passing its live document.
    const orders = await Order.find({ customer_id: req.user.id })
      // shop_photo_url is included so the app can show the shop's real
      // storefront on the tracking and pickup screens - recognising the
      // place matters more than reading its name when you are standing
      // outside it. location comes along for the "View on map" button,
      // which otherwise falls back to searching the address string.
      .populate("shop_id", "shop_name address contact shop_photo_url location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ordersWithQueue = await Promise.all(orders.map((order) => attachQueuePosition(order)));

    res.status(200).json(ordersWithQueue);
  } catch (error) {
    console.error(`Failed to fetch orders: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// Shared helper: loads an order and confirms the logged-in shop owner
// actually owns the shop the order belongs to. Returns the order, or
// null after already sending an error response.
const loadOwnedOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return null;
  }

  const shop = await Shop.findById(order.shop_id);
  if (!shop || shop.owner_id.toString() !== req.user.id) {
    res.status(403).json({ message: "You do not own this shop's orders" });
    return null;
  }

  return order;
};

// PATCH /orders/:id/accept
// Shop owner accepts a pending order, moving it into progress.
const acceptOrder = async (req, res) => {
  try {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;

    if (order.status !== "pending") {
      return res.status(400).json({ message: `Cannot accept an order with status "${order.status}"` });
    }

    order.status = "accepted";
    order.logEvent("accepted", "vendor");
    await order.save();

    await emitOrderEvent(order, ORDER_EVENTS.ORDER_ACCEPTED);

    res.status(200).json(order);
  } catch (error) {
    console.error(`Failed to accept order: ${error.message}`);
    res.status(500).json({ message: "Failed to accept order" });
  }
};

// PATCH /orders/:id/ready
// Shop owner marks the order ready for the customer to pick up.
const readyOrder = async (req, res) => {
  try {
    const order = await loadOwnedOrder(req, res);
    if (!order) return;

    if (order.status !== "accepted") {
      return res.status(400).json({ message: `Cannot mark ready an order with status "${order.status}"` });
    }

    order.status = "ready_for_pickup";
    order.logEvent("ready", "vendor");
    await order.save();

    await emitOrderEvent(order, ORDER_EVENTS.ORDER_READY_FOR_PICKUP);

    res.status(200).json(order);
  } catch (error) {
    console.error(`Failed to update order: ${error.message}`);
    res.status(500).json({ message: "Failed to update order" });
  }
};

// PATCH /orders/:id/complete
// Shop owner completes the order, but only if the OTP supplied by the
// customer (in req.body.otp) matches the one generated at order creation.
//
// Once completed, the customer's documents are no longer needed, so their
// Cloudinary files and Upload records are deleted (see
// utils/documentCleanup.js). This runs strictly AFTER the status change
// is saved, and its own errors are swallowed here - a Cloudinary hiccup
// must never turn a successful order completion into a failed response.
// Any cleanup failure is still logged (with order + upload ids) for
// manual follow-up.
const completeOrder = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "otp is required to complete the order" });
    }

    const order = await loadOwnedOrder(req, res);
    if (!order) return;

    if (order.status !== "ready_for_pickup") {
      return res.status(400).json({ message: `Cannot complete an order with status "${order.status}"` });
    }

    if (order.otp !== otp) {
      return res.status(400).json({ message: "OTP does not match" });
    }

    order.status = "completed";
    order.logEvent("completed", "vendor");
    await order.save();

    await emitOrderEvent(order, ORDER_EVENTS.ORDER_COMPLETED);

    try {
      await deleteOrderDocuments(order);
    } catch (cleanupError) {
      console.error(`[completeOrder] cleanup threw for order ${order._id}: ${cleanupError.message}`);
    }

    res.status(200).json(order);
  } catch (error) {
    console.error(`Failed to complete order: ${error.message}`);
    res.status(500).json({ message: "Failed to complete order" });
  }
};


// GET /orders/:id/documents/:index/view
// Streams one of an order's PDFs back through this server, inline.
//
// Why proxy at all, when order.documents[].file_url is a Cloudinary URL
// the dashboard already has? Two reasons:
//   1. The vendor dashboard is only allowed to VIEW and PRINT a customer's
//      document, not download it. Handing the browser a plain remote URL
//      means a "View / download" link and Cloudinary's own filename in the
//      save dialog; fetched through here the dashboard can hold the file
//      as a blob and render it in its own viewer instead (see
//      DocumentViewer.jsx). Content-Disposition is explicitly inline so
//      nothing about this response suggests a save.
//   2. It puts an auth check in front of the file. The Cloudinary URL
//      itself is unauthenticated - anyone holding it can fetch it - so
//      this route is what makes "only this shop's owner, and only for an
//      order actually placed at their shop" true for the dashboard's path
//      to the file.
//
// NOT a download-proof measure, and shouldn't be described as one: a
// browser that can render a PDF can always save it (the print dialog
// alone offers Save as PDF). It removes the affordance, not the ability.
const viewOrderDocument = async (req, res) => {
  try {
    const { id, index } = req.params;

    const order = await Order.findById(id).select("shop_id customer_id documents status").lean();
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // The order's own shop owner, or the customer who placed it. Same two
    // parties who can see the order at all.
    const isCustomer = order.customer_id?.toString() === req.user.id;
    let allowed = isCustomer;
    if (!allowed) {
      const shop = await Shop.findById(order.shop_id).select("owner_id").lean();
      allowed = shop?.owner_id?.toString() === req.user.id;
    }
    if (!allowed) {
      return res.status(403).json({ message: "You do not have access to this order" });
    }

    // Expired orders have had their Cloudinary files deleted by the
    // cleanup cron, so this would be a 404 from upstream - say why
    // instead of passing that on.
    if (order.status === "expired") {
      return res.status(410).json({ message: "This order expired and its documents were deleted" });
    }

    const docIndex = Number(index);
    const doc = Number.isInteger(docIndex) ? order.documents?.[docIndex] : null;
    if (!doc?.file_url) {
      return res.status(404).json({ message: "Document not found on this order" });
    }

    let buffer;
    if (isLocalDocument(doc.file_url)) {
      buffer = await readLocalDocument(doc.file_url);
    } else {
      const upstream = await fetch(doc.file_url);
      if (!upstream.ok) {
        console.error(`Document fetch failed for order ${id} doc ${docIndex}: ${upstream.status}`);
        return res.status(502).json({ message: "Could not load this document from storage" });
      }
      buffer = Buffer.from(await upstream.arrayBuffer());
    }

    res.setHeader("Content-Type", "application/pdf");
    // inline, and deliberately no filename: nothing here is offering a save.
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");

    res.status(200).send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(410).json({message:'This print file was deleted.'});
    console.error(`Failed to view order document: ${error.message}`);
    res.status(500).json({ message: "Could not load this document" });
  }
};

module.exports = {
  viewOrderDocument,
  createOrder,
  getOrdersForShop,
  getMyOrders,
  acceptOrder,
  readyOrder,
  completeOrder,
};
const {isLocalDocument,readLocalDocument} = require('../utils/localDocuments');
