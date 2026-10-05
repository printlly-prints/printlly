// PostHog: product analytics.
//
// STRICT DIVISION OF LABOUR
//
//   Sentry   - technical errors.    "this is broken, fix it"
//   Teams    - critical alerts.     "a human must act now"
//   PostHog  - product analytics.   "how is the product being used"
//
// Those three are kept apart deliberately. Sending errors to PostHog would
// make the funnel unreadable; sending product events to Sentry would bury
// real defects. Nothing in this application reads from PostHog or makes any
// decision based on it - it is write-only, and removing it entirely would
// change no behaviour.
//
// WHERE EVENTS COME FROM, AND WHY IT IS SPLIT
//
// The backend emits events it can state AUTHORITATIVELY - an order was
// created, a payment was confirmed, a shop accepted a job - because those are
// facts committed to the database. The clients emit INTENT and NAVIGATION -
// the app was opened, a shop page was viewed, a signup form was started -
// because the server never sees those, and a server-side guess at them would
// be wrong.
//
// Concretely: payment_started is a client event because the customer may
// abandon Razorpay's sheet, and payment_completed is a server event because
// only the server knows the money arrived. Emitting payment_completed from
// the client would count payments that never happened, which is the exact
// metric a payment funnel exists to get right.
//
// PRIVACY: an allowlist, not a denylist.
//
// Unlike Sentry - where an error's value is in its unexpected detail, so the
// filter must be a denylist - every analytics property is intentional. There
// is no such thing as a useful analytics property nobody planned. So the set
// of property names that may ever leave is enumerated below and everything
// else is DROPPED, silently and by default. A new field added to an order
// cannot start flowing to PostHog because someone passed an extra object.

const { observabilityConfig } = require("../config/observability");
const { captureError } = require("./sentry");
const { scrub, scrubString } = require("./scrub");

let client = null;
let initialised = false;
let active = false;

// ---------------------------------------------------------------------------
// The event vocabulary
// ---------------------------------------------------------------------------
//
// A fixed list, because an analytics dataset is only as useful as its event
// names are stable: one typo creates a second event that looks like a drop in
// the first. An unknown name is dropped and reported to Sentry as a
// programming error rather than silently creating a new series.
const EVENTS = {
  // ---- customer, server-authoritative ----
  SIGNUP_COMPLETED: "signup_completed",
  DOCUMENT_UPLOAD_COMPLETED: "document_upload_completed",
  ORDER_CREATED: "order_created",
  PAYMENT_COMPLETED: "payment_completed",
  PAYMENT_FAILED: "payment_failed",
  ORDER_READY: "order_ready",
  ORDER_COMPLETED: "order_completed",
  ORDER_EXPIRED: "order_expired",

  // ---- customer, client-emitted (listed so the vocabulary is complete and
  // so the client and server cannot disagree on spelling) ----
  APP_OPENED: "app_opened",
  SIGNUP_STARTED: "signup_started",
  SHOP_VIEWED: "shop_viewed",
  DOCUMENT_UPLOAD_STARTED: "document_upload_started",
  PAYMENT_STARTED: "payment_started",

  // ---- vendor ----
  VENDOR_LOGIN: "vendor_login",
  ORDER_VIEWED: "order_viewed",
  ORDER_ACCEPTED: "order_accepted",
  PRICING_UPDATED: "pricing_updated",
  SHOP_VERIFIED: "shop_verified",
};

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

// ---------------------------------------------------------------------------
// The property allowlist
// ---------------------------------------------------------------------------
//
// Every name that may ever be transmitted. Chosen so that each one is either
// a non-identifying dimension (a count, a mode, a role) or an opaque
// identifier that is meaningless outside this database (an order id).
//
// DELIBERATELY ABSENT, and each for a concrete reason:
//
//   email, phone, name, address  - personal data. PostHog would become a
//                                  copy of the user table.
//   latitude, longitude          - a customer's location.
//   document filenames / URLs    - the filename of a medical report is
//                                  itself the sensitive fact, before anyone
//                                  opens it.
//   otp                          - the pickup secret.
//   razorpay_payment_id, amounts beyond a rounded total - payment detail.
//   shop_name                    - a vendor's trading identity; shop_id is
//                                  sufficient to segment by shop.
const ALLOWED_PROPERTIES = new Set([
  // Identifiers, opaque outside this database
  "order_id",
  "shop_id",
  "upload_id",
  // Role and account shape
  "role",
  "auth_provider",
  // Order dimensions - what was printed, not what was in it
  "page_count",
  "copies",
  "file_count",
  "color_mode",
  "paper_size",
  "binding",
  "print_sides",
  // Money, as a rounded total only. Useful for an average order value, and
  // not a payment credential.
  "total_amount",
  "platform_fee",
  // Funnel and timing
  "status",
  "payment_status",
  "payment_method",
  "failure_reason",
  "queue_position",
  "source", // "app" | "web" | "admin"
  "duration_ms",
  // Client context, set by the clients
  "platform",
  "app_version",
]);

function sanitiseProperties(properties) {
  const out = {};
  if (!properties || typeof properties !== "object") return out;

  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTIES.has(key)) continue;
    if (value === undefined || value === null) continue;

    // Scrubbed as well as allowlisted. The allowlist governs the NAME; this
    // governs the VALUE, so that a field named `status` carrying a stack
    // trace with a document URL in it still cannot leak.
    const safe = scrub(value);
    const type = typeof safe;
    // Scalars only. An object or array under an allowed name would be an
    // unreviewed payload, and no analytics question here needs nesting.
    if (type === "string" || type === "number" || type === "boolean") {
      out[key] = safe;
    }
  }

  return out;
}

function initAnalytics() {
  if (initialised) return active;
  initialised = true;

  let config;
  try {
    config = observabilityConfig().posthog;
  } catch (error) {
    console.error("[posthog] disabled: " + error.message);
    return false;
  }

  if (!config.enabled) return false;

  try {
    const { PostHog } = require("posthog-node");
    client = new PostHog(config.apiKey, {
      host: config.host,
      // Batched. Analytics must never add latency to a customer's request,
      // so events accumulate and are flushed on an interval or at a batch
      // size, never synchronously inside a handler.
      flushAt: config.flushAt,
      flushInterval: config.flushIntervalMs,
      // PostHog's own error logging, off for the same reason Sentry's is: a
      // PostHog outage must not fill the application log at the moment the
      // application log matters.
      disableGeoip: true,
    });

    // The client emits errors (a failed batch) as events rather than
    // throwing. Swallowed so a PostHog outage is invisible to the
    // application, which is the requirement.
    if (typeof client.on === "function") {
      client.on("error", (error) => {
        console.error("[posthog] batch delivery failed: " + scrubString((error && error.message) || ""));
      });
    }

    active = true;
    return true;
  } catch (error) {
    console.error("[posthog] initialisation failed, continuing without it: " + error.message);
    active = false;
    return false;
  }
}

const isAnalyticsActive = () => active;

// Records one product event. Never throws, never blocks, never awaits a
// network call.
//
//   event       one of EVENTS
//   userId      the distinct id. A Mongo user id: pseudonymous, and the only
//               thing that lets a funnel follow one person across steps
//               without PostHog holding any personal data.
//   properties  filtered through ALLOWED_PROPERTIES.
function trackEvent({ event, userId, properties = {} }) {
  try {
    if (!active) return false;

    if (!KNOWN_EVENTS.has(event)) {
      // A programming error - an event name that no dashboard will ever be
      // built against. Reported once rather than silently accepted.
      captureError(new Error('Unknown analytics event "' + event + '"'), {
        tags: { feature: "analytics" },
      });
      return false;
    }

    if (!userId) {
      // An event with no subject cannot contribute to a funnel. Dropped
      // rather than attributed to an invented anonymous id, which would
      // inflate user counts.
      return false;
    }

    const config = observabilityConfig();

    client.capture({
      distinctId: String(userId),
      event,
      properties: {
        ...sanitiseProperties(properties),
        // Environment and release on every event, so staging traffic can be
        // excluded from a real funnel and a behaviour change can be tied to
        // a deploy.
        environment: config.identity.environment,
        release: config.identity.release,
        $process_person_profile: false,
      },
    });

    return true;
  } catch (error) {
    // Analytics failing must never be visible to a caller.
    console.error("[posthog] capture failed: " + scrubString((error && error.message) || ""));
    return false;
  }
}

// Sends anything buffered. Called on shutdown so the last few events are not
// lost, and by the test suite.
async function flushAnalytics() {
  try {
    if (!active || !client) return true;
    await client.flush();
    return true;
  } catch {
    return false;
  }
}

async function shutdownAnalytics() {
  try {
    if (!active || !client) return true;
    await client.shutdown();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  initAnalytics,
  isAnalyticsActive,
  trackEvent,
  flushAnalytics,
  shutdownAnalytics,
  sanitiseProperties,
  EVENTS,
  KNOWN_EVENTS,
  ALLOWED_PROPERTIES,
};
