// Transactional email, through Brevo.
//
// ARCHITECTURE, and where this sits
//
//   authoritative business operation
//           |
//   database state change COMMITTED
//           |
//   emitOrderEvent()            <- utils/orderEvents.js
//      |      |      |      |
//   socket  push  in-app  EMAIL  <- here
//
// Email is a fourth delivery channel hanging off the SAME fan-out point that
// already drives Socket.io, push and the in-app record. It is deliberately
// not a separate trigger in each controller: four channels told by four
// different code paths is four chances for one of them to say something the
// others do not, and the first divergence would be about money.
//
// Everything here is downstream of the database. An email is only ever sent
// after the state change is committed, and a failure to send never affects
// the operation that triggered it - a customer's order is paid whether or not
// Brevo is reachable.
//
// DEDUPLICATION is durable, in MongoDB, keyed on the primary key. See
// models/EmailDelivery.js for why an in-memory set is not sufficient.
//
// WHY NO SDK
//
// Brevo's send endpoint is one HTTPS POST with a JSON body. @getbrevo/brevo
// is a generated client wrapping that one call in a class hierarchy, and it
// brings its own HTTP stack and transitive dependencies. Using fetch directly
// means: an explicit timeout we control, exactly the fields we intend to
// send, no dependency to audit, and a transport that is trivially
// substitutable in tests (see setEmailTransport). For a single endpoint the
// SDK buys nothing and costs supply-chain surface.

const EmailDelivery = require("../models/EmailDelivery");
const User = require("../models/User");
const { observabilityConfig } = require("../config/observability");
const { captureError } = require("./sentry");
const { scrubString } = require("./scrub");

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
//
// Every event below has a REAL trigger in this codebase. Nothing is defined
// speculatively, because a template with no caller is dead code that reads as
// a feature.
//
// Deliberately NOT here, and why:
//
//   account verification  - there is no email-verification flow. POST
//                           /auth/register activates the account directly.
//   password reset        - there is no forgot-password route. POST
//                           /auth/change-password requires the CURRENT
//                           password, so there is no reset link to send.
//   refund notification   - no refund is implemented anywhere in the backend;
//                           there is no Razorpay refund call. An email saying
//                           a refund has been issued would be a false
//                           statement from the platform.
//   admin operational mail- critical operations alerting goes to Teams
//                           (utils/alerts.js), which is built for it. A
//                           second copy by email would be one more thing to
//                           mute.
//
// WHAT NEVER APPEARS IN AN EMAIL BODY
//
//   - the pickup OTP. It is the one secret proving the customer is at the
//     counter. It is already kept out of push payloads for that reason
//     (utils/orderEvents.js), and an email is a longer-lived, more widely
//     forwarded, more frequently breached artefact than a push notification.
//     The email points at the app, where the OTP is shown to the
//     authenticated owner of the order.
//   - document URLs or filenames. A Cloudinary delivery URL is the document.
//   - payment credentials, card details, or anything from Razorpay beyond a
//     payment id.
//   - another customer's or shop's information.

// Shared chrome. Plain, inline-styled HTML with no images, no web fonts and
// no tracking pixel: those are what make an email land in spam, and an
// open-tracking pixel on a payment receipt is a privacy cost with no product
// benefit.
function layout({ heading, lines, footerNote }) {
  const body = lines
    .filter(Boolean)
    .map((line) => '<p style="margin:0 0 14px;line-height:1.6;color:#2B3A38">' + line + "</p>")
    .join("");

  return [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">',
    '<div style="font-size:19px;font-weight:700;color:#12463C;margin-bottom:4px">Paprout</div>',
    '<div style="font-size:13px;color:#6B7B78;margin-bottom:22px">Print Smarter. Skip the Wait.</div>',
    '<h1 style="font-size:20px;color:#12463C;margin:0 0 16px">' + heading + "</h1>",
    body,
    footerNote
      ? '<p style="margin:22px 0 0;font-size:12px;color:#6B7B78;line-height:1.6">' + footerNote + "</p>"
      : "",
    '<hr style="border:none;border-top:1px solid #E3EAE8;margin:24px 0 12px">',
    '<p style="margin:0;font-size:11.5px;color:#8A9896;line-height:1.6">',
    "This is an automated message about your Paprout account. Please do not reply to it.",
    "</p>",
    "</div>",
  ].join("");
}

// Strips HTML to a plain-text alternative. Every message carries both,
// because a text/plain part materially improves deliverability and is what
// a screen reader and a watch notification actually read.
function toPlainText(html) {
  return html
    .replace(/<\/p>|<\/div>|<\/h1>|<hr[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// HTML-escapes an interpolated value. Shop names and customer names are
// user-controlled strings; a shop called "Raj & Sons <Print>" must not break
// the markup, and a shop name containing a tag must not inject one.
function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const money = (amount) => "Rs " + Number(amount || 0).toFixed(2);

// event -> { audience, subject(params), html(params) }
//
// audience is documentation and a safety check: a "customer" template may
// only ever be addressed to the order's customer, and a "vendor" one to a
// shop's owner.
const TEMPLATES = {
  // ---- customer ----

  // One email at the moment the order becomes real, serving as both order
  // confirmation and payment receipt.
  //
  // There is deliberately no separate "order placed" email. A Paprout order
  // is created BEFORE payment (POST /orders leaves payment_status "created")
  // and a shop never sees an unpaid order, so an email at creation would
  // confirm something that may never happen, and would arrive seconds before
  // this one. The same reasoning is why utils/orderEvents.js has no
  // ORDER_CREATED event.
  order_confirmed: {
    audience: "customer",
    subject: (p) => "Order confirmed - " + p.shopName,
    html: (p) =>
      layout({
        heading: "Your order is confirmed",
        lines: [
          "Hi " + esc(p.customerName) + ", we have received your payment and sent your order to <strong>" + esc(p.shopName) + "</strong>.",
          "<strong>Order reference:</strong> " + esc(p.orderRef) + "<br><strong>Amount paid:</strong> " + money(p.amount),
          "The shop will accept your order shortly. You will be emailed again when it is ready to collect.",
          "Your pickup code is shown in the Paprout app under this order. For your security we do not include it in email - you will need it at the counter to collect your prints.",
        ],
        footerNote:
          "Your uploaded files are deleted automatically once the order is completed, and sooner if it expires.",
      }),
  },

  payment_failed: {
    audience: "customer",
    subject: () => "Your Paprout payment did not go through",
    html: (p) =>
      layout({
        heading: "Payment unsuccessful",
        lines: [
          "Hi " + esc(p.customerName) + ", your payment for the order at <strong>" + esc(p.shopName) + "</strong> was not completed, so the order has not been sent to the shop.",
          "<strong>Order reference:</strong> " + esc(p.orderRef),
          "If money left your account it will be returned by your bank or card issuer - a failed payment is not captured by us. You are welcome to try paying again from the app.",
        ],
      }),
  },

  order_accepted: {
    audience: "customer",
    subject: (p) => "Accepted by " + p.shopName,
    html: (p) =>
      layout({
        heading: "The shop has accepted your order",
        lines: [
          "<strong>" + esc(p.shopName) + "</strong> has accepted your print order and will begin work on it.",
          "<strong>Order reference:</strong> " + esc(p.orderRef),
          "We will email you again as soon as it is ready to collect.",
        ],
      }),
  },

  order_ready: {
    audience: "customer",
    subject: (p) => "Ready to collect at " + p.shopName,
    html: (p) =>
      layout({
        heading: "Your prints are ready",
        lines: [
          "Your order is ready to collect at <strong>" + esc(p.shopName) + "</strong>.",
          "<strong>Order reference:</strong> " + esc(p.orderRef),
          "Open the Paprout app to see your pickup code, and show it at the counter to collect.",
        ],
      }),
  },

  order_completed: {
    audience: "customer",
    subject: () => "Order collected - thank you",
    html: (p) =>
      layout({
        heading: "Order completed",
        lines: [
          "Your order from <strong>" + esc(p.shopName) + "</strong> has been collected. Thank you for using Paprout.",
          "<strong>Order reference:</strong> " + esc(p.orderRef) + "<br><strong>Total paid:</strong> " + money(p.amount),
          "Your uploaded files have now been scheduled for deletion from our storage.",
        ],
      }),
  },

  order_expired: {
    audience: "customer",
    subject: () => "Your Paprout order has expired",
    html: (p) =>
      layout({
        heading: "Order expired",
        lines: [
          "Your order at <strong>" + esc(p.shopName) + "</strong> expired because it was not completed in time, and its uploaded files have been deleted.",
          "<strong>Order reference:</strong> " + esc(p.orderRef),
          "You are welcome to place a new order from the app whenever you are ready.",
        ],
      }),
  },

  // A security notification, not a reset link - there is no reset flow. This
  // is the email that tells someone their password changed when it was not
  // them who changed it, which is the point at which an account takeover
  // becomes noticeable.
  password_changed: {
    audience: "any",
    subject: () => "Your Paprout password was changed",
    html: (p) =>
      layout({
        heading: "Your password was changed",
        lines: [
          "Hi " + esc(p.customerName) + ", the password on your Paprout account was changed just now, and you have been signed out on every device.",
          "If you did this, nothing further is needed.",
          "<strong>If this was not you</strong>, someone else may have had access to your account. Sign in and change your password again immediately, and contact support.",
        ],
      }),
  },

  // ---- vendor ----

  vendor_welcome: {
    audience: "vendor",
    subject: () => "Welcome to Paprout for print partners",
    html: (p) =>
      layout({
        heading: "Your print partner account is ready",
        lines: [
          "Hi " + esc(p.vendorName) + ", thank you for registering as a Paprout print partner.",
          "The next step is to add your shop details, pricing and verification documents from the partner dashboard. Our team reviews each shop before it becomes visible to customers, and you will be emailed with the outcome.",
          "Until your shop is verified it will not appear in customer search and cannot take orders.",
        ],
      }),
  },

  shop_approved: {
    audience: "vendor",
    subject: () => "Your shop has been verified",
    html: (p) =>
      layout({
        heading: "Your shop is live",
        lines: [
          "<strong>" + esc(p.shopName) + "</strong> has been verified and is now visible to customers. You can start receiving print orders.",
          "Keep your opening hours and pricing up to date in the dashboard - customers see both when choosing a shop.",
        ],
      }),
  },

  shop_rejected: {
    audience: "vendor",
    subject: () => "Your shop verification needs attention",
    html: (p) =>
      layout({
        heading: "Verification was not approved",
        lines: [
          "<strong>" + esc(p.shopName) + "</strong> was not approved at this time.",
          p.reason ? "<strong>Reason given:</strong> " + esc(p.reason) : null,
          "You can update your details and resubmit your verification documents from the partner dashboard.",
        ],
      }),
  },

  vendor_new_order: {
    audience: "vendor",
    subject: () => "New paid print order",
    html: (p) =>
      layout({
        heading: "You have a new order",
        lines: [
          "A customer has paid for a print order at <strong>" + esc(p.shopName) + "</strong>.",
          "<strong>Order reference:</strong> " + esc(p.orderRef) + "<br><strong>Your amount for this order:</strong> " + money(p.vendorAmount),
          "Open the partner dashboard to view the documents and accept the order. The customer is waiting on your acceptance.",
        ],
        footerNote:
          "Customer documents are only viewable in the dashboard, and only until the order is completed.",
      }),
  },

  vendor_settlement_paid: {
    audience: "vendor",
    subject: () => "Settlement processed",
    html: (p) =>
      layout({
        heading: "A settlement has been recorded",
        lines: [
          "A settlement has been recorded for <strong>" + esc(p.shopName) + "</strong>.",
          "<strong>Amount:</strong> " + money(p.amount) + "<br><strong>Orders included:</strong> " + esc(p.orderCount),
          "The breakdown is available in the partner dashboard under settlements.",
        ],
        footerNote:
          "This records the settlement in Paprout. The transfer itself is made outside the platform - Paprout does not move money to partner accounts.",
      }),
  },
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

// Substitutable, so the test suite can drive success, transient failure and
// permanent failure without an account and without sending mail to anyone.
// The same seam shape utils/pushNotifications.js uses for Expo.
let transport = null;

function setEmailTransport(fake) {
  transport = fake;
}

// Classifies a provider failure, which decides whether a retry can possibly
// help.
//
//   transient - rate limited, provider 5xx, timeout, network. Retry.
//   permanent - rejected address, malformed request, bad credentials. Do not
//               retry: the same request will be refused identically, and
//               retrying would burn quota and hide the real problem.
function classifyFailure(status, message) {
  if (!status) return "transient"; // network error or timeout
  if (status === 429) return "transient";
  if (status >= 500) return "transient";
  if (status === 401 || status === 403) return "permanent"; // credentials
  if (status >= 400) return "permanent";
  return "transient";
}

// One HTTPS POST to Brevo, with a hard timeout. Returns
// { ok, status, messageId, error }. Never throws.
async function brevoSend({ config, to, toName, subject, html, text }) {
  if (transport) return transport({ config, to, toName, subject, html, text });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: to, name: toName || undefined }],
        replyTo: config.replyTo ? { email: config.replyTo } : undefined,
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The provider's error body is read for its message, then scrubbed.
      // It echoes the request on a 400, which can include the recipient.
      let detail = "";
      try {
        const body = await response.text();
        detail = scrubString(body.slice(0, 300));
      } catch {
        detail = "(no body)";
      }
      return { ok: false, status: response.status, error: "HTTP " + response.status + " " + detail };
    }

    let messageId = "";
    try {
      const body = await response.json();
      messageId = body && body.messageId ? String(body.messageId) : "";
    } catch {
      // A 2xx with an unparseable body is still a success - Brevo accepted it.
    }

    return { ok: true, status: response.status, messageId };
  } catch (error) {
    const reason = error.name === "AbortError" ? "timeout after " + config.timeoutMs + "ms" : scrubString(error.message || "network error");
    return { ok: false, status: 0, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------
//
// Mirrors the backoff already used for failed document deletions
// (utils/documentCleanup.js): a few attempts, widening gaps, then stop.
//
// Capped at 4 attempts because the value of a transactional email decays.
// "Your order is ready" delivered six hours late is worse than not delivered,
// and the customer has the in-app notification and the push either way -
// email is the third-most-reliable of the three channels, not the only one.
const MAX_ATTEMPTS = 4;
const BACKOFF_MINUTES = [1, 5, 20];

function nextAttemptDelayMinutes(attempts) {
  return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
}

// How long a "claimed" record may sit before the retry pass takes it over.
// Same reasoning as the webhook claim in paymentWebhookController.js: a
// process that died mid-send leaves a claim, and treating that as sent would
// silently drop the email.
const STALE_CLAIM_MS = 5 * 60 * 1000;

const expiryDate = () =>
  new Date(Date.now() + EmailDelivery.RETENTION_DAYS * 24 * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

// Claims the right to send one email, exactly once.
//
// Returns "claimed", "duplicate", or "error". The insert is the claim: a
// duplicate-key error is the answer "already handled", not a failure.
async function claimEmail(deliveryId, fields) {
  try {
    await EmailDelivery.create({
      _id: deliveryId,
      ...fields,
      status: "claimed",
      attempts: 0,
      claimed_at: new Date(),
      expires_at: expiryDate(),
    });
    return "claimed";
  } catch (error) {
    if (error.code !== 11000) throw error;

    const previous = await EmailDelivery.findById(deliveryId).select("status claimed_at").lean();

    if (previous && previous.status === "claimed") {
      const age = Date.now() - new Date(previous.claimed_at).getTime();
      if (age > STALE_CLAIM_MS) {
        const retaken = await EmailDelivery.findOneAndUpdate(
          { _id: deliveryId, status: "claimed", claimed_at: previous.claimed_at },
          { $set: { claimed_at: new Date() } }
        );
        if (retaken) return "claimed";
      }
    }

    return "duplicate";
  }
}

// Performs the send for an already-claimed record and writes the outcome.
async function deliver({ deliveryId, event, to, toName, params, config }) {
  const template = TEMPLATES[event];
  const html = template.html(params);
  const result = await brevoSend({
    config,
    to,
    toName,
    subject: template.subject(params),
    html,
    text: toPlainText(html),
  });

  if (result.ok) {
    await EmailDelivery.updateOne(
      { _id: deliveryId },
      {
        $set: {
          status: "sent",
          sent_at: new Date(),
          provider_message_id: result.messageId || "",
          last_error: "",
          next_attempt_at: null,
        },
        $inc: { attempts: 1 },
      }
    );
    // Recipient is never logged - the delivery id and event are enough to
    // find the record, which holds the user reference.
    console.log(
      "[email] " + JSON.stringify({ event, delivery_id: deliveryId, result: "sent", timestamp: new Date().toISOString() })
    );
    return { sent: true, outcome: "sent" };
  }

  const kind = classifyFailure(result.status, result.error);
  const record = await EmailDelivery.findById(deliveryId).select("attempts").lean();
  const attempts = ((record && record.attempts) || 0) + 1;
  const canRetry = kind === "transient" && attempts < MAX_ATTEMPTS;

  await EmailDelivery.updateOne(
    { _id: deliveryId },
    {
      $set: {
        status: canRetry ? "retrying" : "failed",
        attempts,
        last_error: scrubString(result.error || "unknown"),
        next_attempt_at: canRetry
          ? new Date(Date.now() + nextAttemptDelayMinutes(attempts) * 60 * 1000)
          : null,
      },
    }
  );

  console.error(
    "[email] " +
      JSON.stringify({
        event,
        delivery_id: deliveryId,
        result: canRetry ? "retrying" : "failed",
        kind,
        attempts,
        status: result.status,
        error: scrubString(result.error || ""),
        timestamp: new Date().toISOString(),
      })
  );

  // Sentry, not Teams, for an individual failure: one email that did not
  // arrive is a P2. The provider being DOWN is a different judgement, made by
  // the caller that notices a run of failures - see
  // emailProviderFailureStreak below.
  captureError(new Error("Transactional email failed: " + event), {
    level: canRetry ? "warning" : "error",
    tags: { feature: "email", email_event: event, failure_kind: kind },
    delivery_id: deliveryId,
    provider_status: result.status,
    attempts,
  });

  return { sent: false, outcome: canRetry ? "retrying" : "failed", kind };
}

// Consecutive provider failures, which is what distinguishes "one address
// bounced" from "Brevo is down". Only the latter is worth a Teams card, and
// the distinction cannot be made from a single send.
let failureStreak = 0;
const PROVIDER_DOWN_THRESHOLD = 5;

function emailProviderFailureStreak() {
  return failureStreak;
}

function resetEmailFailureStreak() {
  failureStreak = 0;
}

// THE entry point.
//
// sendTransactionalEmail({ event, userId, to, toName, params, dedupeId, ... })
//
//   event     a key of TEMPLATES
//   userId    recipient, by reference. The address is resolved from the User
//             document so this module never caches an address.
//   to        an explicit address, for the rare case where there is no user.
//   dedupeId  what makes this email unique. Defaults to the order id, then
//             the shop id, then the user id. Two calls with the same event
//             and dedupeId send ONE email, ever.
//
// Returns { sent, outcome }. NEVER THROWS. Email is downstream of the
// business operation, so a failure anywhere in here - including a database
// failure writing the dedupe record - must surface as a return value and not
// as an exception into a controller.
async function sendTransactionalEmail({
  event,
  userId = null,
  to = null,
  toName = null,
  params = {},
  dedupeId = null,
  orderId = null,
  shopId = null,
}) {
  try {
    const template = TEMPLATES[event];
    if (!template) {
      // A programming error, not a delivery failure. Reported rather than
      // thrown, because the caller is a notification fan-out that must not
      // fail.
      captureError(new Error('Unknown email event "' + event + '"'), {
        tags: { feature: "email" },
      });
      return { sent: false, outcome: "unknown_event" };
    }

    let config;
    try {
      config = observabilityConfig().brevo;
    } catch (error) {
      console.error("[email] configuration invalid, not sending: " + error.message);
      return { sent: false, outcome: "misconfigured" };
    }

    const subject = dedupeId || orderId || shopId || userId;
    if (!subject) return { sent: false, outcome: "no_dedupe_subject" };
    const deliveryId = event + ":" + String(subject);

    // Resolve the recipient BEFORE claiming, so a user with no address does
    // not leave a claimed record behind that the retry pass would pick up
    // forever.
    let recipient = to;
    let recipientName = toName;
    if (!recipient && userId) {
      const user = await User.findById(userId).select("email name").lean();
      if (user) {
        recipient = user.email;
        recipientName = recipientName || user.name;
      }
    }

    if (!recipient) {
      return { sent: false, outcome: "no_recipient" };
    }

    // Not configured, or switched off. Recorded as "skipped" rather than
    // silently dropped, so that an operator can see afterwards which emails
    // a deployment did not send - and so that enabling Brevo later does not
    // produce a flood of backdated mail, because the dedupe key is taken.
    if (!config.enabled) {
      try {
        await claimEmail(deliveryId, {
          event,
          user_id: userId,
          order_id: orderId,
          shop_id: shopId,
        });
        await EmailDelivery.updateOne(
          { _id: deliveryId },
          { $set: { status: "skipped", last_error: "brevo not configured" } }
        );
      } catch {
        // Not worth reporting: the email was never going to be sent.
      }
      return { sent: false, outcome: "disabled" };
    }

    const claim = await claimEmail(deliveryId, {
      event,
      user_id: userId,
      order_id: orderId,
      shop_id: shopId,
    });

    if (claim === "duplicate") {
      // The expected, healthy case on a webhook redelivery or a retried
      // controller. Not an error.
      return { sent: false, outcome: "duplicate" };
    }

    const result = await deliver({ deliveryId, event, to: recipient, toName: recipientName, params, config });

    if (result.sent) failureStreak = 0;
    else failureStreak += 1;

    return result;
  } catch (error) {
    // Includes a MongoDB failure while claiming. The email is lost, which is
    // acceptable; the operation that triggered it is not affected, which is
    // the requirement.
    console.error("[email] send failed for " + event + ": " + scrubString(error.message || ""));
    captureError(error, { tags: { feature: "email", email_event: event } });
    return { sent: false, outcome: "error" };
  }
}

// ---------------------------------------------------------------------------
// Retry pass
// ---------------------------------------------------------------------------
//
// Retries transient failures whose backoff has elapsed, and takes over claims
// abandoned by a process that died mid-send. Scheduled by
// cron/retryEmails.js.
//
// The recipient is resolved again from the User document on each attempt
// rather than stored, so a customer who corrected their address receives the
// retry at the new one.
async function retryFailedEmails({ limit = 25 } = {}) {
  const summary = { attempted: 0, sent: 0, failed: 0, retrying: 0, abandoned: 0 };

  let config;
  try {
    config = observabilityConfig().brevo;
  } catch {
    return summary;
  }
  if (!config.enabled) return summary;

  try {
    const due = await EmailDelivery.find({
      $or: [
        { status: "retrying", next_attempt_at: { $lte: new Date() } },
        { status: "claimed", claimed_at: { $lte: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    })
      .sort({ next_attempt_at: 1 })
      .limit(limit)
      .lean();

    for (const record of due) {
      summary.attempted += 1;

      const template = TEMPLATES[record.event];
      if (!template) {
        await EmailDelivery.updateOne(
          { _id: record._id },
          { $set: { status: "failed", last_error: "template no longer exists" } }
        );
        summary.abandoned += 1;
        continue;
      }

      // A retry cannot reconstruct the original template parameters - they
      // came from an order that may since have changed. Rather than email
      // stale details, the retry re-derives what it can and otherwise
      // abandons the attempt. Order-scoped emails are re-derived; anything
      // else is marked failed.
      const params = await rebuildParams(record);
      if (!params) {
        await EmailDelivery.updateOne(
          { _id: record._id },
          { $set: { status: "failed", last_error: "could not rebuild email context" } }
        );
        summary.abandoned += 1;
        continue;
      }

      let recipient = null;
      let recipientName = null;
      if (record.user_id) {
        const user = await User.findById(record.user_id).select("email name").lean();
        if (user) {
          recipient = user.email;
          recipientName = user.name;
        }
      }
      if (!recipient) {
        await EmailDelivery.updateOne(
          { _id: record._id },
          { $set: { status: "failed", last_error: "recipient no longer resolvable" } }
        );
        summary.abandoned += 1;
        continue;
      }

      const result = await deliver({
        deliveryId: record._id,
        event: record.event,
        to: recipient,
        toName: recipientName,
        params,
        config,
      });

      if (result.sent) {
        summary.sent += 1;
        failureStreak = 0;
      } else if (result.outcome === "retrying") {
        summary.retrying += 1;
        failureStreak += 1;
      } else {
        summary.failed += 1;
        failureStreak += 1;
      }
    }
  } catch (error) {
    console.error("[email] retry pass failed: " + scrubString(error.message || ""));
    captureError(error, { tags: { feature: "email", stage: "retry_pass" } });
  }

  return summary;
}

// Reassembles the template parameters for a retry from the ids on the record.
// Returns null when the context no longer exists, which is a reason to
// abandon rather than to send something wrong.
async function rebuildParams(record) {
  try {
    const Order = require("../models/Order");
    const Shop = require("../models/Shop");

    const params = {};

    if (record.user_id) {
      const user = await User.findById(record.user_id).select("name").lean();
      params.customerName = (user && user.name) || "there";
      params.vendorName = params.customerName;
    }

    if (record.order_id) {
      const order = await Order.findById(record.order_id).select("shop_id total_amount vendor_amount").lean();
      if (!order) return null;
      params.orderRef = String(record.order_id).slice(-8).toUpperCase();
      params.amount = order.total_amount;
      params.vendorAmount = order.vendor_amount;
      const shop = await Shop.findById(order.shop_id).select("shop_name").lean();
      params.shopName = (shop && shop.shop_name) || "the shop";
      return params;
    }

    if (record.shop_id) {
      const shop = await Shop.findById(record.shop_id).select("shop_name").lean();
      if (!shop) return null;
      params.shopName = shop.shop_name;
      return params;
    }

    // A user-scoped email with no order or shop - password_changed,
    // vendor_welcome. Everything it needs is already in params.
    return params;
  } catch {
    return null;
  }
}

// A short, stable, human-quotable reference for an order. The full ObjectId is
// unwieldy to read over a counter, and the last 8 hex characters are unique
// enough to identify an order within one shop's day.
const orderRef = (orderId) => String(orderId).slice(-8).toUpperCase();

module.exports = {
  sendTransactionalEmail,
  retryFailedEmails,
  setEmailTransport,
  classifyFailure,
  emailProviderFailureStreak,
  resetEmailFailureStreak,
  orderRef,
  toPlainText,
  TEMPLATES,
  MAX_ATTEMPTS,
  PROVIDER_DOWN_THRESHOLD,
};
