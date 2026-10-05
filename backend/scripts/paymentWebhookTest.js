// Tests the Razorpay payment webhook: signature verification, raw-body
// handling, event mapping, reconciliation, amount validation, idempotency and
// retry behaviour.
//
// WHAT IS AND IS NOT VERIFIED HERE
//
// No real money moves and no real Razorpay transaction is performed. Razorpay
// cannot deliver a webhook to localhost, so THEIR delivery system is not
// exercised by this suite - that is stated plainly rather than implied.
//
// What IS exercised is the real Express endpoint, reached over HTTP, with
// authentic Razorpay-shaped payloads signed using HMAC-SHA256 over the exact
// raw bytes with the actual configured RAZORPAY_WEBHOOK_SECRET - which is
// precisely what Razorpay does. Duplicate delivery, out-of-order delivery and
// the retry path are driven by sending the same signed payload again, which is
// also what a Razorpay retry is.
//
// Every order and user it touches is one it created, carrying this run's
// stamp, and all of it is deleted on the way out. It never reads or modifies a
// real order.
//
// Run with: node scripts/paymentWebhookTest.js   (server must be running)
require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const WebhookEvent = require("../models/WebhookEvent");
const Notification = require("../models/Notification");

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const WEBHOOK_URL = `${BASE_URL}/payments/webhook`;
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const STAMP = Date.now().toString(36);

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};
const section = (title) => console.log(`\n--- ${title} ---`);

const created = { userIds: [], shopIds: [], orderIds: [], eventIds: [] };

// Builds a Razorpay-shaped payment event. Mirrors the real payload structure:
// event name at the top, entity nested under payload.payment.entity.
function paymentEvent({ event, paymentId, razorpayOrderId, amountPaise, currency = "INR" }) {
  return {
    entity: "event",
    account_id: "acc_TESTACCOUNT",
    event,
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: amountPaise,
          currency,
          status: event === "payment.failed" ? "failed" : "captured",
          order_id: razorpayOrderId,
          method: "upi",
          captured: event !== "payment.failed",
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

const sign = (rawBody, secret = SECRET) =>
  crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

// Posts a webhook the way Razorpay does: raw JSON bytes, the signature over
// those exact bytes, and the event id in the header.
async function postWebhook(eventObject, { eventId, secret = SECRET, signature, mutateBody } = {}) {
  const original = Buffer.from(JSON.stringify(eventObject), "utf8");
  // The signature is computed over the ORIGINAL bytes and the MUTATED bytes
  // are then sent - which is what a tampered delivery looks like. Signing
  // after mutating would just produce a valid signature over the new body and
  // prove nothing.
  const raw = mutateBody ? Buffer.from(mutateBody(original.toString("utf8")), "utf8") : original;
  const signedBytes = original;

  const id = eventId || `evt_test_${STAMP}_${Math.random().toString(36).slice(2, 10)}`;
  created.eventIds.push(id);

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": signature || sign(signedBytes, secret),
      "X-Razorpay-Event-Id": id,
    },
    body: raw,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, eventId: id };
}

// Creates a customer, shop and unpaid order directly in the database, with a
// razorpay_order_id already stored - the state POST /payments/razorpay/
// create-order leaves an order in, which is what the webhook reconciles to.
async function makeUnpaidOrder({ total = 120, label = "a" } = {}) {
  const customer = await User.create({
    name: `Webhook Test Customer ${label}`,
    email: `webhooktest.cust.${label}.${STAMP}@example.com`,
    phone: `6${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`,
    password_hash: await bcrypt.hash("WebhookTestPass12", 10),
    role: "customer",
  });
  const owner = await User.create({
    name: `Webhook Test Owner ${label}`,
    email: `webhooktest.owner.${label}.${STAMP}@example.com`,
    phone: `5${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 900 + 100)}`,
    password_hash: await bcrypt.hash("WebhookTestPass12", 10),
    role: "shop_owner",
  });
  created.userIds.push(customer._id.toString(), owner._id.toString());

  const shop = await Shop.create({
    owner_id: owner._id,
    shop_name: `Webhook Test Shop ${label} ${STAMP}`,
    address: "1 Test Street",
    contact: "9000000000",
    is_verified: true,
    verification_status: "approved",
  });
  created.shopIds.push(shop._id.toString());

  const platformFee = 5;
  const order = await Order.create({
    customer_id: customer._id,
    shop_id: shop._id,
    documents: [
      {
        upload_id: new mongoose.Types.ObjectId(),
        original_name: "test.pdf",
        file_url: "https://example.invalid/not-a-real-document.pdf",
        page_count: 1,
        copies: 1,
        color_mode: "bw",
        paper_size: "A4",
        sides: "single",
        services: [],
        pricing: {
          base: total - platformFee,
          paper_charge: 0,
          sides_charge: 0,
          services_charge: 0,
          document_total: total - platformFee,
        },
      },
    ],
    base_subtotal: total - platformFee,
    platform_fee: platformFee,
    total_amount: total,
    razorpay_order_id: `order_TEST${STAMP}${label}${Math.floor(Math.random() * 1000)}`,
  });
  created.orderIds.push(order._id.toString());
  return order;
}

const reload = (id) => Order.findById(id).lean();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  if (!SECRET) throw new Error("RAZORPAY_WEBHOOK_SECRET is not set - cannot test signing");
  const health = await fetch(`${BASE_URL}/`).catch(() => null);
  if (!health || !health.ok) throw new Error(`server not responding at ${BASE_URL}`);

  console.log(`Razorpay webhook tests ${STAMP} against ${WEBHOOK_URL}`);
  console.log("NOTE: no real Razorpay transaction is performed; payloads are signed locally");
  console.log("      with the configured webhook secret, exactly as Razorpay signs them.\n");

  // =========================================================================
  section("Signature verification");
  // =========================================================================

  const order1 = await makeUnpaidOrder({ total: 120, label: "sig" });
  const goodEvent = paymentEvent({
    event: "payment.captured",
    paymentId: `pay_TEST${STAMP}sig`,
    razorpayOrderId: order1.razorpay_order_id,
    amountPaise: 12000,
  });

  const accepted = await postWebhook(goodEvent);
  check(accepted.status === 200, "a correctly signed webhook is accepted", `${accepted.status} ${JSON.stringify(accepted.data)}`);

  const noSig = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Event-Id": `evt_nosig_${STAMP}` },
    body: JSON.stringify(goodEvent),
  });
  check(noSig.status === 400, "a webhook with NO signature is rejected", String(noSig.status));

  const badSig = await postWebhook(goodEvent, { signature: "f".repeat(64), eventId: `evt_badsig_${STAMP}` });
  check(badSig.status === 400, "a webhook with an invalid signature is rejected", String(badSig.status));

  const shortSig = await postWebhook(goodEvent, { signature: "abc", eventId: `evt_shortsig_${STAMP}` });
  check(shortSig.status === 400, "a malformed (too short) signature is rejected without throwing", String(shortSig.status));

  const wrongSecret = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}ws`,
      razorpayOrderId: order1.razorpay_order_id,
      amountPaise: 12000,
    }),
    { secret: "a-different-webhook-secret-entirely", eventId: `evt_wrongsecret_${STAMP}` }
  );
  check(wrongSecret.status === 400, "a signature made with the WRONG secret is rejected", String(wrongSecret.status));

  // The body is altered after signing, so the signature no longer covers it.
  const order2 = await makeUnpaidOrder({ total: 120, label: "tamper" });
  const tampered = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}tamper`,
      razorpayOrderId: order2.razorpay_order_id,
      amountPaise: 12000,
    }),
    {
      eventId: `evt_tampered_${STAMP}`,
      mutateBody: (body) => body.replace('"amount":12000', '"amount":1'),
    }
  );
  check(tampered.status === 400, "a body modified AFTER signing is rejected (the HMAC covers the bytes)", String(tampered.status));
  check(
    (await reload(order2._id)).payment_status === "created",
    "...and the tampered-with order was NOT marked paid"
  );

  // =========================================================================
  section("Raw body handling");
  // =========================================================================

  // Razorpay's own serialisation would not be reproduced by JSON.parse then
  // JSON.stringify. Signing bytes whose key order differs from what a parser
  // would emit proves the handler verified the raw bytes it received.
  const order3 = await makeUnpaidOrder({ total: 80, label: "raw" });
  const oddlyOrdered =
    `{"created_at":${Math.floor(Date.now() / 1000)},` +
    `"payload":{"payment":{"entity":{"order_id":"${order3.razorpay_order_id}",` +
    `"currency":"INR","amount":8000,"status":"captured","id":"pay_TEST${STAMP}raw"}}},` +
    `"event":"payment.captured","entity":"event"}`;
  const rawBuf = Buffer.from(oddlyOrdered, "utf8");
  const rawRes = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": sign(rawBuf),
      "X-Razorpay-Event-Id": `evt_raw_${STAMP}`,
    },
    body: rawBuf,
  });
  created.eventIds.push(`evt_raw_${STAMP}`);
  check(
    rawRes.status === 200,
    "a payload whose key order differs from any re-serialisation still verifies (raw bytes are used)",
    String(rawRes.status)
  );
  check(
    (await reload(order3._id)).payment_status === "paid",
    "...and it was processed, so express.json() did not consume or reshape the body"
  );

  // The global JSON parser must be unharmed for every other route.
  const jsonStillWorks = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `nobody.${STAMP}@example.com`, password: "WhateverPass123" }),
  });
  check(
    jsonStillWorks.status === 401,
    "normal JSON routes still parse their bodies (login reached its handler and returned 401, not 400)",
    String(jsonStillWorks.status)
  );

  // =========================================================================
  section("Successful payment reconciliation");
  // =========================================================================

  const paid1 = await reload(order1._id);
  check(paid1.payment_status === "paid", "the webhook marked the reconciled order paid", paid1.payment_status);
  check(typeof paid1.otp === "string" && /^\d{6}$/.test(paid1.otp), "an OTP was generated for the customer", paid1.otp ? "6 digits" : String(paid1.otp));
  check(
    paid1.vendor_amount === 115,
    "vendor_amount was frozen as total_amount - platform_fee",
    `${paid1.vendor_amount} (120 - 5)`
  );
  check(
    paid1.razorpay_payment_id === `pay_TEST${STAMP}sig`,
    "the Razorpay payment id was stored on the order",
    paid1.razorpay_payment_id
  );

  // Reconciliation must be by the id WE issued, not by anything else.
  const unknownOrder = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}unknown`,
      razorpayOrderId: `order_DOESNOTEXIST${STAMP}`,
      amountPaise: 12000,
    }),
    { eventId: `evt_unknown_${STAMP}` }
  );
  check(unknownOrder.status === 200, "a signed event for an unknown razorpay order id is acknowledged, not retried forever", String(unknownOrder.status));
  check(
    unknownOrder.data?.status === "order_not_found",
    "...and reported as order_not_found",
    JSON.stringify(unknownOrder.data)
  );
  const fabricated = await Order.countDocuments({ razorpay_order_id: `order_DOESNOTEXIST${STAMP}` });
  check(fabricated === 0, "NO order was fabricated for the unknown reference", `${fabricated} orders created`);
  const unknownRecord = await WebhookEvent.findById(`evt_unknown_${STAMP}`).lean();
  check(
    unknownRecord?.result === "order_not_found",
    "...but the anomaly was durably recorded for investigation",
    unknownRecord?.result
  );

  // =========================================================================
  section("Amount validation");
  // =========================================================================

  const mismatchOrder = await makeUnpaidOrder({ total: 200, label: "amt" });
  const mismatch = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}amt`,
      razorpayOrderId: mismatchOrder.razorpay_order_id,
      amountPaise: 100, // 1 rupee against a 200 rupee order
    }),
    { eventId: `evt_mismatch_${STAMP}` }
  );
  check(mismatch.data?.status === "amount_mismatch", "an amount that disagrees with our own total is refused", JSON.stringify(mismatch.data));
  const afterMismatch = await reload(mismatchOrder._id);
  check(afterMismatch.payment_status === "created", "...the order was NOT marked paid", afterMismatch.payment_status);
  check(afterMismatch.total_amount === 200, "...and our server-side total was NOT overwritten by the webhook's amount", String(afterMismatch.total_amount));
  check(afterMismatch.vendor_amount === null, "...and no vendor amount was frozen");
  const mismatchRecord = await WebhookEvent.findById(`evt_mismatch_${STAMP}`).lean();
  check(
    mismatchRecord?.result === "amount_mismatch" && /expected 20000/.test(mismatchRecord.detail || ""),
    "...and the anomaly was recorded with both figures",
    mismatchRecord?.detail
  );

  const currencyOrder = await makeUnpaidOrder({ total: 90, label: "cur" });
  const wrongCurrency = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}cur`,
      razorpayOrderId: currencyOrder.razorpay_order_id,
      amountPaise: 9000,
      currency: "USD",
    }),
    { eventId: `evt_currency_${STAMP}` }
  );
  check(wrongCurrency.data?.status === "currency_mismatch", "a non-INR currency is refused", JSON.stringify(wrongCurrency.data));
  check((await reload(currencyOrder._id)).payment_status === "created", "...and that order was not marked paid");

  // =========================================================================
  section("Idempotency");
  // =========================================================================

  const idemOrder = await makeUnpaidOrder({ total: 150, label: "idem" });
  const idemEvent = paymentEvent({
    event: "payment.captured",
    paymentId: `pay_TEST${STAMP}idem`,
    razorpayOrderId: idemOrder.razorpay_order_id,
    amountPaise: 15000,
  });
  const idemId = `evt_idem_${STAMP}`;

  const first = await postWebhook(idemEvent, { eventId: idemId });
  check(first.data?.status === "processed", "first delivery processes the payment", JSON.stringify(first.data));
  const afterFirst = await reload(idemOrder._id);

  const second = await postWebhook(idemEvent, { eventId: idemId });
  check(second.status === 200, "a redelivery of the SAME event returns 200 (so Razorpay stops retrying)", String(second.status));
  check(second.data?.status === "already_processed", "...and reports it as already processed", JSON.stringify(second.data));

  const third = await postWebhook(idemEvent, { eventId: idemId });
  check(third.data?.status === "already_processed", "a third delivery is still idempotent");

  const afterRepeats = await reload(idemOrder._id);
  check(afterRepeats.otp === afterFirst.otp, "the OTP is UNCHANGED by redelivery (the customer's code still works)", afterRepeats.otp === afterFirst.otp ? "same" : `${afterFirst.otp} -> ${afterRepeats.otp}`);
  check(afterRepeats.vendor_amount === afterFirst.vendor_amount && afterRepeats.vendor_amount === 145, "vendor_amount was not incremented or recomputed", String(afterRepeats.vendor_amount));
  check(
    (await Order.countDocuments({ razorpay_order_id: idemOrder.razorpay_order_id })) === 1,
    "exactly ONE order exists for this Razorpay order - no duplicate was created"
  );
  check(
    (await WebhookEvent.countDocuments({ _id: idemId })) === 1,
    "exactly one webhook event record exists for the three deliveries"
  );

  // A DIFFERENT event id for a payment already confirmed - what a
  // payment.captured arriving after the client callback looks like.
  const laterEvent = await postWebhook(idemEvent, { eventId: `evt_idem_other_${STAMP}` });
  check(
    laterEvent.data?.status === "already_paid",
    "a NEW event for an already-paid order reports already_paid and changes nothing",
    JSON.stringify(laterEvent.data)
  );
  const afterLater = await reload(idemOrder._id);
  check(
    afterLater.otp === afterFirst.otp && afterLater.vendor_amount === afterFirst.vendor_amount,
    "...and the paid order is byte-for-byte unchanged (same OTP, same vendor amount)"
  );

  // =========================================================================
  section("Payment state machine");
  // =========================================================================

  const failOrder = await makeUnpaidOrder({ total: 60, label: "fail" });
  const failed = await postWebhook(
    paymentEvent({
      event: "payment.failed",
      paymentId: `pay_TEST${STAMP}fail`,
      razorpayOrderId: failOrder.razorpay_order_id,
      amountPaise: 6000,
    }),
    { eventId: `evt_failed_${STAMP}` }
  );
  check(failed.data?.status === "processed", "a payment.failed event is processed", JSON.stringify(failed.data));
  const afterFail = await reload(failOrder._id);
  check(afterFail.payment_status === "failed", "...the order is marked failed, so the customer can retry", afterFail.payment_status);
  check(afterFail.otp === null, "...no OTP was generated for a failed payment");
  check(afterFail.vendor_amount === null, "...and nothing was frozen as owed to the vendor");

  // The transition that must never happen: paid -> failed.
  const outOfOrder = await postWebhook(
    paymentEvent({
      event: "payment.failed",
      paymentId: `pay_TEST${STAMP}idem`,
      razorpayOrderId: idemOrder.razorpay_order_id,
      amountPaise: 15000,
    }),
    { eventId: `evt_latefail_${STAMP}` }
  );
  check(
    outOfOrder.data?.status === "already_paid",
    "a failure event for an ALREADY PAID order is refused (paid is never undone)",
    JSON.stringify(outOfOrder.data)
  );
  const afterOutOfOrder = await reload(idemOrder._id);
  check(afterOutOfOrder.payment_status === "paid", "...the order is still paid", afterOutOfOrder.payment_status);
  check(afterOutOfOrder.otp === afterFirst.otp, "...with its OTP intact");

  // A failed payment can still be paid later - the retry path.
  const retryPaid = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}failretry`,
      razorpayOrderId: failOrder.razorpay_order_id,
      amountPaise: 6000,
    }),
    { eventId: `evt_failretry_${STAMP}` }
  );
  check(retryPaid.data?.status === "processed", "a later successful capture moves failed -> paid (a genuine retry)", JSON.stringify(retryPaid.data));
  check((await reload(failOrder._id)).payment_status === "paid", "...and the order is now paid");

  // =========================================================================
  section("Event mapping");
  // =========================================================================

  const ignoreOrder = await makeUnpaidOrder({ total: 70, label: "ignore" });
  for (const eventType of ["order.paid", "payment.authorized", "refund.created", "subscription.charged"]) {
    const res = await postWebhook(
      paymentEvent({
        event: eventType,
        paymentId: `pay_TEST${STAMP}${eventType.replace(/\./g, "")}`,
        razorpayOrderId: ignoreOrder.razorpay_order_id,
        amountPaise: 7000,
      }),
      { eventId: `evt_${eventType.replace(/\./g, "_")}_${STAMP}` }
    );
    check(
      res.status === 200 && res.data?.status === "ignored",
      `"${eventType}" is acknowledged but not acted on`,
      JSON.stringify(res.data)
    );
  }
  check(
    (await reload(ignoreOrder._id)).payment_status === "created",
    "none of those events changed the order's payment state (authorized did NOT mark it paid)"
  );

  // =========================================================================
  section("Security");
  // =========================================================================

  check(accepted.status === 200, "the webhook required no customer JWT (every call above was unauthenticated)");

  const withCustomerJwt = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: `pay_TEST${STAMP}jwt`,
      razorpayOrderId: `order_IRRELEVANT${STAMP}`,
      amountPaise: 100,
    }),
    { eventId: `evt_jwt_${STAMP}` }
  );
  check(withCustomerJwt.status === 200, "...and is not behind verifyToken, so Razorpay can reach it");

  const unsignedReachesNothing = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": "00".repeat(32) },
    body: JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: order1.razorpay_order_id, amount: 1 } } } }),
  });
  check(unsignedReachesNothing.status === 400, "an unsigned attempt to re-pay a real order is rejected at the signature");
  check(
    (await WebhookEvent.countDocuments({ razorpay_order_id: order1.razorpay_order_id })) === 1,
    "...and no event record was written for the rejected request (nothing is trusted before verification)"
  );

  const secretLeak = JSON.stringify([accepted.data, badSig.data, mismatch.data, first.data]);
  check(!secretLeak.includes(SECRET), "no webhook response contains the webhook secret");
  const storedRecords = await WebhookEvent.find({ _id: { $in: created.eventIds } }).lean();
  const recordsJson = JSON.stringify(storedRecords);
  check(!recordsJson.includes(SECRET), "no stored event record contains the webhook secret");
  check(
    !recordsJson.includes("not-a-real-document.pdf") && !recordsJson.includes("example.invalid"),
    "no stored event record contains a document name or URL"
  );
  check(
    storedRecords.every((r) => !("payload" in r) && !("body" in r)),
    "no stored event record contains the raw payload"
  );

  // =========================================================================
  section("Regression: the client callback path still works");
  // =========================================================================

  // The client path is unchanged in behaviour but now shares markOrderPaid
  // with the webhook, so it is worth proving it still confirms a payment and
  // is still idempotent. The signature here is the CLIENT signature - HMAC
  // over "<razorpay_order_id>|<razorpay_payment_id>" with KEY_SECRET - which
  // is a different construction from the webhook's.
  const clientOrder = await makeUnpaidOrder({ total: 110, label: "client" });
  const clientCustomerId = clientOrder.customer_id;
  const jwt = require("jsonwebtoken");
  const Session = require("../models/Session");
  const jti = crypto.randomBytes(32).toString("hex");
  await Session.create({
    _id: jti,
    user_id: clientCustomerId,
    expires_at: new Date(Date.now() + 3600000),
  });
  const customerToken = jwt.sign(
    { id: clientCustomerId, role: "customer", jti },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const clientPaymentId = `pay_TEST${STAMP}client`;
  const clientSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${clientOrder.razorpay_order_id}|${clientPaymentId}`)
    .digest("hex");

  const verifyRes = await fetch(`${BASE_URL}/payments/razorpay/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${customerToken}` },
    body: JSON.stringify({
      order_id: clientOrder._id.toString(),
      razorpay_order_id: clientOrder.razorpay_order_id,
      razorpay_payment_id: clientPaymentId,
      razorpay_signature: clientSignature,
    }),
  });
  const verifyData = await verifyRes.json();
  check(verifyRes.status === 200 && verifyData.success === true, "client-side payment verification still succeeds", `${verifyRes.status}`);
  const afterClient = await reload(clientOrder._id);
  check(afterClient.payment_status === "paid", "...the order is paid", afterClient.payment_status);
  check(afterClient.vendor_amount === 105, "...vendor_amount frozen (110 - 5)", String(afterClient.vendor_amount));
  check(
    afterClient.razorpay_payment_id === clientPaymentId,
    "...and the client path now stores razorpay_payment_id too (it previously did not)",
    afterClient.razorpay_payment_id
  );

  // The scenario the brief calls out: a delayed webhook arriving after the
  // client already confirmed must not create a second order or change state.
  const lateWebhook = await postWebhook(
    paymentEvent({
      event: "payment.captured",
      paymentId: clientPaymentId,
      razorpayOrderId: clientOrder.razorpay_order_id,
      amountPaise: 11000,
    }),
    { eventId: `evt_late_${STAMP}` }
  );
  check(
    lateWebhook.data?.status === "already_paid",
    "a webhook arriving AFTER the client callback is a no-op, not a second payment",
    JSON.stringify(lateWebhook.data)
  );
  const afterLate = await reload(clientOrder._id);
  check(
    afterLate.otp === afterClient.otp && afterLate.vendor_amount === afterClient.vendor_amount,
    "...the order is unchanged (same OTP, same vendor amount)"
  );
  check(
    (await Order.countDocuments({ razorpay_order_id: clientOrder.razorpay_order_id })) === 1,
    "...and still exactly one order exists for that Razorpay order"
  );

  await Session.deleteOne({ _id: jti });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function cleanup() {
  section("cleaning up test data");
  try {
    // Notifications too: confirming a payment now emits an order event,
    // which creates an in-app notification for the customer
    // (utils/orderEvents.js). Deleting the order and the user without these
    // left records behind pointing at users that no longer existed.
    const n = await Notification.deleteMany({
      $or: [{ order_id: { $in: created.orderIds } }, { user_id: { $in: created.userIds } }],
    });
    // Email-delivery records too. Order events now also dispatch
    // transactional email (utils/orderEvents.js), and each attempt writes a
    // durable dedupe record keyed on the order - including when Brevo is
    // unconfigured, where the record is written as "skipped" precisely so an
    // operator can see which emails a deployment did not send. Deleting the
    // order and the user without these left records pointing at rows that no
    // longer exist.
    const EmailDelivery = require("../models/EmailDelivery");
    const ed = await EmailDelivery.deleteMany({
      $or: [{ order_id: { $in: created.orderIds } }, { user_id: { $in: created.userIds } }],
    });
    const o = await Order.deleteMany({ _id: { $in: created.orderIds } });
    const s = await Shop.deleteMany({ _id: { $in: created.shopIds } });
    const u = await User.deleteMany({ _id: { $in: created.userIds } });
    const e = await WebhookEvent.deleteMany({ _id: { $in: created.eventIds } });
    console.log(
      `removed ${o.deletedCount} order(s), ${s.deletedCount} shop(s), ${u.deletedCount} user(s), ${n.deletedCount} notification(s), ${e.deletedCount} webhook event record(s), ${ed.deletedCount} email record(s)`
    );
  } catch (error) {
    console.error(`cleanup failed: ${error.message}`);
  }
  await mongoose.disconnect();
}

main()
  .catch((error) => {
    console.error("\npaymentWebhookTest crashed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
