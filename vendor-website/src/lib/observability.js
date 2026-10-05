// Error reporting and product analytics for the print partner dashboard.
//
// Both are optional and silent when unconfigured, exactly as on the backend:
// a dashboard whose keys are unset must behave identically to one whose
// provider is down, so the outage path is the one in daily use.
//
// WHY BOTH SDKs ARE LOADED WITH A DYNAMIC import()
//
// This bundle does not only serve the vendor dashboard. The same application
// serves the public landing page and all twelve legal pages, so a customer
// reading the refund policy downloads whatever is in the main chunk. Imported
// statically, @sentry/react and posthog-js added roughly 200 KB gzipped to
// that chunk - paid by every visitor, in every deployment, including the
// deployments that have neither key configured.
//
// Loaded dynamically, each SDK becomes its own chunk that is fetched only
// when its key is actually present. An unconfigured deployment never
// downloads a byte of either, and a configured one pays the cost once, in
// parallel, after first paint.
//
// The cost of this choice is a window of a few milliseconds between the page
// starting and Sentry's global handlers being installed, during which an
// error would be missed. That is a real but small loss, and it buys back a
// much larger and more certain one - 200 KB on the critical path of a public
// page, for every visitor, forever.
//
// WHAT MAY GO IN THIS FILE'S ENVIRONMENT
//
// Only the Sentry DSN and the PostHog PROJECT key. Both are write-only
// credentials designed to be shipped in a browser bundle. No other secret may
// ever carry a VITE_ prefix: Vite inlines those into the JavaScript it
// serves, so a VITE_ variable is published, not configured.

const env = import.meta.env || {};

const SENTRY_DSN = env.VITE_SENTRY_DSN || "";
const POSTHOG_KEY = env.VITE_POSTHOG_KEY || "";
const POSTHOG_HOST = env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";
const ENVIRONMENT = env.VITE_ENVIRONMENT || (env.PROD ? "production" : "development");
const RELEASE = env.VITE_APP_RELEASE || "printlly-dashboard@1.0.0";

// The loaded modules, or null. Everything exported below checks these, so a
// call that happens before the SDK has finished loading is a no-op rather
// than a crash.
let sentry = null;
let posthog = null;

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------
//
// The browser mirror of the backend's utils/scrub.js. Smaller, because a
// browser carries less, but aimed at the same things.
//
// What a dashboard session actually holds that must not leave it: the
// vendor's JWT (in localStorage, and on every outbound request), and customer
// document URLs - this dashboard fetches a customer's PDF and renders it, so
// a Cloudinary URL is in memory on every order screen.
const PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[JWT_REDACTED]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, "Bearer [REDACTED]"],
  [/https?:\/\/[^\s"'<>]*cloudinary[^\s"'<>]*/gi, "[DOCUMENT_URL_REDACTED]"],
  // A blob: URL is how this dashboard renders a fetched PDF
  // (components/DocumentViewer.jsx). It is only valid inside this one
  // document, so it is useless to anyone else - but it appears in breadcrumbs
  // and reads as a leak, so it goes too.
  [/blob:[^\s"'<>]+/gi, "[BLOB_URL_REDACTED]"],
];

export function scrubText(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out.length > 500 ? out.slice(0, 500) + "...[truncated]" : out;
}

const DENY_KEY = /pass|token|secret|auth|otp|jwt|signature|document|email|phone|address|url/i;

export function scrubObject(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value;
  if (typeof value === "string") return scrubText(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrubObject(item, depth + 1));

  const out = {};
  for (const key of Object.keys(value).slice(0, 40)) {
    out[key] = DENY_KEY.test(key) ? "[REDACTED]" : scrubObject(value[key], depth + 1);
  }
  return out;
}

// The Sentry options, kept as a function so the admin panel's near-identical
// copy is easy to diff against this one.
function sentryOptions() {
  return {
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    // OFF. Sentry's default PII collection includes the user's IP address
    // and, for browser errors, the headers of the failing request - which
    // here means the vendor's bearer token.
    sendDefaultPii: false,
    // No tracing and no session replay. Replay would be a serious mistake in
    // this application: it records the DOM, and this dashboard's main screen
    // renders a customer's document alongside their order. A replay would be
    // a recording of other people's files.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    beforeSend(event) {
      try {
        if (event.request) {
          event.request = {
            method: event.request.method,
            url: scrubText((event.request.url || "").split("?")[0]),
            headers: undefined,
            cookies: undefined,
            data: undefined,
          };
        }
        // Id and role only - set by identifyUser below. Never the vendor's
        // name, email or phone.
        if (event.user) event.user = { id: event.user.id, role: event.user.role };
        if (event.extra) event.extra = scrubObject(event.extra);
        if (typeof event.message === "string") event.message = scrubText(event.message);
        if (event.exception && event.exception.values) {
          for (const value of event.exception.values) {
            if (typeof value.value === "string") value.value = scrubText(value.value);
          }
        }
        return event;
      } catch {
        // Drop rather than risk sending something unfiltered.
        return null;
      }
    },

    beforeBreadcrumb(breadcrumb) {
      try {
        // A `console` breadcrumb carries whatever the application logged,
        // which during development includes whole API responses - orders,
        // documents and all. Dropped entirely rather than filtered.
        if (breadcrumb.category === "console") return null;

        // fetch/xhr breadcrumbs carry the request URL, which for the document
        // endpoint names an order and a document index.
        if (breadcrumb.data && breadcrumb.data.url) {
          breadcrumb.data.url = scrubText(String(breadcrumb.data.url).split("?")[0]);
        }
        if (typeof breadcrumb.message === "string") {
          breadcrumb.message = scrubText(breadcrumb.message);
        }
        return breadcrumb;
      } catch {
        return null;
      }
    },
  };
}

// Pending identity, for the case where identifyUser is called before the SDKs
// have loaded - which is the normal case, since AuthContext restores a
// session synchronously on mount. Applied once each SDK is ready, so the
// identity is not simply lost on every page load.
let pendingUser = null;

export async function initSentry() {
  if (!SENTRY_DSN) return false;

  try {
    const module = await import("@sentry/react");
    module.init(sentryOptions());
    sentry = module;
    if (pendingUser) module.setUser(pendingUser);
    return true;
  } catch (error) {
    // A broken error reporter must not break the application it reports on.
    console.error("[observability] Sentry init failed:", error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------
//
// THE MOST IMPORTANT DECISION IN THIS FILE IS THAT AUTOCAPTURE IS OFF.
//
// PostHog's autocapture records clicks and input interactions along with the
// TEXT CONTENT of the element involved. On this dashboard that text is a
// customer's name, their order details and the filenames of the documents
// they uploaded - and a filename is frequently the sensitive part before
// anyone opens the file. Autocapture would quietly turn a product-analytics
// tool into a feed of customer data, with no call site anywhere in this
// codebase to review.
//
// So every event this dashboard sends is explicit, named, and filtered
// through the same allowlist the backend uses.
export async function initAnalytics() {
  if (!POSTHOG_KEY) return false;

  try {
    const module = await import("posthog-js");
    const client = module.default || module;

    client.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // See above. Not negotiable in this application.
      autocapture: false,
      // Session recording is a DOM recording. This dashboard renders customer
      // documents. Off.
      disable_session_recording: true,
      // Pageview events would carry the URL, which includes order ids. The
      // dashboard sends its own named events instead, so nothing is lost.
      capture_pageview: false,
      capture_pageleave: false,
      // Without this, every anonymous visitor to the landing page creates a
      // person profile - and this bundle serves the landing page.
      person_profiles: "identified_only",
      disable_surveys: true,
      persistence: "localStorage",
      // PostHog being unreachable must be invisible to the vendor.
      on_xhr_error: () => {},
    });

    posthog = client;
    if (pendingUser) client.identify(pendingUser.id, { role: pendingUser.role });
    return true;
  } catch (error) {
    console.error("[observability] PostHog init failed:", error.message);
    return false;
  }
}

// The same allowlist discipline as the backend: analytics properties are
// always intentional, so the permitted names are enumerated and anything else
// is dropped.
const ALLOWED_PROPERTIES = new Set([
  "order_id",
  "shop_id",
  "role",
  "status",
  "payment_status",
  "page_count",
  "file_count",
  "source",
  "platform",
  "app_version",
]);

// Events this dashboard is allowed to send. Vendor-side navigation and
// intent; everything authoritative is emitted by the backend, because only
// the backend knows whether it actually happened.
const KNOWN_EVENTS = new Set(["vendor_login", "order_viewed", "app_opened"]);

export function trackEvent(event, properties = {}) {
  try {
    if (!posthog || !KNOWN_EVENTS.has(event)) return false;

    const safe = { source: "web" };
    for (const [key, value] of Object.entries(properties)) {
      if (!ALLOWED_PROPERTIES.has(key)) continue;
      const type = typeof value;
      if (type === "string" || type === "number" || type === "boolean") safe[key] = value;
    }

    posthog.capture(event, safe);
    return true;
  } catch {
    return false;
  }
}

// Attaches the signed-in vendor's identity to subsequent errors and events.
//
// ID AND ROLE ONLY. Passing the whole user object would send the vendor's
// name, email and phone to two third parties, and neither needs them: the id
// is what joins a funnel together and what an engineer looks up in the
// database.
export function identifyUser(user) {
  try {
    if (!user || !user._id) return;
    const identity = { id: String(user._id), role: user.role };

    // Remembered even when neither SDK has loaded yet, so the identity is
    // applied as soon as they do rather than being lost. This is the normal
    // case - AuthContext restores a session on mount, which happens before a
    // dynamically imported module has arrived.
    pendingUser = identity;

    if (sentry) sentry.setUser(identity);
    if (posthog) posthog.identify(identity.id, { role: identity.role });
  } catch {
    // Identity is a convenience. Failing to set it must not break sign-in.
  }
}

export function clearUser() {
  try {
    pendingUser = null;
    if (sentry) sentry.setUser(null);
    if (posthog) posthog.reset();
  } catch {
    // Ignored for the same reason as above.
  }
}

// Reports an error the application handled itself, so it is visible as a
// trend without having been allowed to crash the page. Also what
// components/ErrorBoundary.jsx calls.
export function reportError(error, context = {}) {
  try {
    if (!sentry) return;
    sentry.withScope((scope) => {
      scope.setExtras(scrubObject(context));
      sentry.captureException(error);
    });
  } catch {
    // Ignored.
  }
}

export { ALLOWED_PROPERTIES, KNOWN_EVENTS };
