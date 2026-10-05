// Error reporting for the internal admin panel.
//
// SENTRY ONLY. THERE IS DELIBERATELY NO PRODUCT ANALYTICS HERE.
//
// PostHog measures how the product is used by its customers. This panel is
// used by a handful of internal staff doing verification and settlement work,
// so events from it would measure employees rather than the product - and
// would pollute the same funnels the customer app and the dashboard feed. If
// someone later wants to know how long a verification review takes, that is a
// question for the backend's own records, not for a product-analytics tool.
//
// WHY THIS IS THE MOST PRIVACY-SENSITIVE OF THE THREE CLIENTS
//
// The admin panel sees things neither other client does: every vendor's KYC
// documents, every customer's order, every settlement amount, and the support
// inbox. An unfiltered error report from this application could carry any of
// it. So the scrubbing below is stricter than the dashboard's, and the three
// Sentry features that record context automatically - session replay,
// console breadcrumbs and request data - are all off rather than filtered.
//
// Only VITE_SENTRY_DSN belongs in this file's environment, and a DSN is a
// write-only credential designed to be shipped in a browser bundle. No other
// secret may ever carry a VITE_ prefix: Vite inlines those into the
// JavaScript it serves, so a VITE_ variable is published, not configured.
//
// THE SDK IS LOADED WITH A DYNAMIC import(), matching the dashboard's
// lib/observability.js. The reason is weaker here than there - this panel is
// internal and has no public pages - but the benefit is still real: a
// deployment with no DSN never downloads the SDK at all, and an unconfigured
// deployment behaving exactly like an offline one is the property every
// integration in this project is built around.

const env = import.meta.env || {};

const SENTRY_DSN = env.VITE_SENTRY_DSN || "";
const ENVIRONMENT = env.VITE_ENVIRONMENT || (env.PROD ? "production" : "development");
const RELEASE = env.VITE_APP_RELEASE || "printlly-admin@1.0.0";

// Stricter than the dashboard's list, because this application handles KYC
// files, payout details and the support inbox.
const PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[JWT_REDACTED]"],
  [/Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, "Bearer [REDACTED]"],
  // Customer documents, shop photos AND vendor KYC files all live on
  // Cloudinary, and the URL is the file to anyone holding it.
  [/https?:\/\/[^\s"'<>]*cloudinary[^\s"'<>]*/gi, "[DOCUMENT_URL_REDACTED]"],
  [/blob:[^\s"'<>]+/gi, "[BLOB_URL_REDACTED]"],
  // Indian bank and identity formats, which appear in vendor payout details
  // and KYC records and nowhere else in the product.
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "[IFSC_REDACTED]"],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[PAN_REDACTED]"],
  [/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b/g, "[GSTIN_REDACTED]"],
  [/\b\d{9,18}\b/g, "[ACCOUNT_NUMBER_REDACTED]"],
];

export function scrubText(value) {
  if (typeof value !== "string") return value;
  let out = value;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out.length > 500 ? out.slice(0, 500) + "...[truncated]" : out;
}

const DENY_KEY =
  /pass|token|secret|auth|otp|jwt|signature|document|kyc|email|phone|address|url|account|ifsc|upi|bank|payout|gst|pan/i;

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

// The loaded module, or null. Everything below checks it, so a call made
// before the SDK has arrived is a no-op rather than a crash.
let sentry = null;

// Pending identity, for the case where identifyUser runs before the SDK has
// loaded - the normal case, since AuthContext restores a session on mount.
let pendingUser = null;

export async function initSentry() {
  if (!SENTRY_DSN) return false;

  try {
    const module = await import("@sentry/react");
    module.init({
      dsn: SENTRY_DSN,
      environment: ENVIRONMENT,
      release: RELEASE,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      // NO SESSION REPLAY, under any circumstances. Replay records the DOM,
      // and this application's screens show vendor KYC documents, customer
      // orders and support conversations. A replay would be a video recording
      // of other people's identity documents.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      integrations: [],

      beforeSend(event) {
        try {
          if (event.request) {
            event.request = {
              method: event.request.method,
              // Path only, query string discarded entirely rather than
              // filtered - admin list views pass filters that name shops and
              // customers.
              url: scrubText((event.request.url || "").split("?")[0]),
              headers: undefined,
              cookies: undefined,
              data: undefined,
            };
          }
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
          return null;
        }
      },

      beforeBreadcrumb(breadcrumb) {
        try {
          // Console breadcrumbs are dropped wholesale. In this application a
          // logged API response is a list of vendors with their KYC state, or
          // a support thread.
          if (breadcrumb.category === "console") return null;
          // So are UI breadcrumbs, which carry the text of the element
          // clicked - here, a vendor's name or a customer's order.
          if (breadcrumb.category === "ui.click" || breadcrumb.category === "ui.input") return null;

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
    });
    sentry = module;
    if (pendingUser) module.setUser(pendingUser);
    return true;
  } catch (error) {
    // A broken error reporter must not break the application it reports on.
    console.error("[observability] Sentry init failed:", error.message);
    return false;
  }
}

// Id and role only. An admin's identity is useful for answering "who hit
// this"; their name and email are not needed to answer it.
export function identifyUser(user) {
  try {
    if (!user || !user._id) return;
    const identity = { id: String(user._id), role: user.role };
    pendingUser = identity;
    if (sentry) sentry.setUser(identity);
  } catch {
    // Identity is a convenience; failing to set it must not break sign-in.
  }
}

export function clearUser() {
  try {
    pendingUser = null;
    if (sentry) sentry.setUser(null);
  } catch {
    // Ignored for the same reason as above.
  }
}

// Reports an error the panel handled itself. Also what
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

