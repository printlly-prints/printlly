// Product analytics for the customer app.
//
// WHAT IS HERE, AND WHAT IS DELIBERATELY NOT
//
// PostHog only. There is NO error-reporting SDK in this app, and that is a
// considered decision rather than an omission:
//
//   @sentry/react-native contains native iOS and Android code. Adding it
//   requires a config plugin and a native rebuild, which means this project
//   would need EAS set up - and app.json currently has no EAS project id at
//   all (see the note at the end of the repository's .env.example, which
//   records the same gap blocking push notifications). Installing it today
//   would break the Expo Go workflow the app is developed in and could not be
//   verified by any build this repository can currently run.
//
//   So the customer app's crash reporting is listed as an outstanding item
//   with the exact steps, rather than half-added. The backend reports every
//   API-side failure the app can trigger, and ErrorBoundary.js below keeps a
//   JS crash from becoming a blank screen.
//
// PostHog's React Native SDK, by contrast, is pure JavaScript - every one of
// its native peer dependencies is optional, and the three this app already
// has (async-storage, react-navigation, safe-area-context) are enough. It
// works in Expo Go today and needs no native build.
//
// WHICH EVENTS BELONG HERE
//
// Only what the server cannot know. The backend emits everything
// authoritative - an order was created, a payment was confirmed - because
// only the backend knows those actually happened. This app emits INTENT and
// NAVIGATION: the app was opened, a shop was looked at, a signup was begun, a
// payment sheet was opened. Emitting payment_completed from here would count
// payments that never completed, which is the exact number a payment funnel
// exists to get right.
//
// EXPO_PUBLIC_POSTHOG_KEY is the PROJECT key (phc_...), which is designed to
// be shipped in a client. Nothing else may be added to this app's
// environment: Expo inlines every EXPO_PUBLIC_ variable into the JavaScript
// bundle, so an EXPO_PUBLIC_ variable is published, not configured. The Brevo
// key, the Teams webhook, the Razorpay secret and the backend's own Sentry
// DSN are all server-only.

import PostHog from "posthog-react-native";

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

let client = null;

// The event vocabulary, matching the backend's utils/analytics.js exactly.
// Shared spelling is the whole point: one typo creates a second event that
// looks like a drop in the first.
export const EVENTS = {
  APP_OPENED: "app_opened",
  SIGNUP_STARTED: "signup_started",
  SHOP_VIEWED: "shop_viewed",
  DOCUMENT_UPLOAD_STARTED: "document_upload_started",
  PAYMENT_STARTED: "payment_started",
};

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

// The same allowlist discipline as the backend. Every analytics property is
// intentional, so the permitted names are enumerated and anything else is
// dropped - a new field on a shop or an order cannot start flowing to PostHog
// because someone passed an extra object.
//
// Deliberately absent: shop names, document filenames, the customer's name,
// email, phone or location, the pickup OTP, and anything from Razorpay.
const ALLOWED_PROPERTIES = new Set([
  "order_id",
  "shop_id",
  "file_count",
  "page_count",
  "total_amount",
  "queue_position",
  "role",
  "source",
  "platform",
]);

export function initAnalytics() {
  if (!POSTHOG_KEY) return false;

  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // OFF. React Native autocapture records touches together with the
      // accessibility label or text of the element touched - which on the
      // order screens is a shop name and an uploaded document's filename. A
      // filename is frequently the sensitive part before anyone opens the
      // file, so autocapture would turn an analytics tool into a feed of
      // customer data with no call site in this codebase to review.
      captureNativeAppLifecycleEvents: false,
      autocapture: false,
      // Session replay records the screen. This app shows the customer's
      // document list and their pickup OTP. Never.
      enableSessionReplay: false,
      // Batched, so analytics never adds latency to a screen.
      flushAt: 20,
      flushInterval: 30000,
      // Only create a person profile once a customer has signed in.
      // Otherwise every app open from a browsing visitor creates one.
      personProfiles: "identified_only",
    });
    return true;
  } catch (error) {
    // Analytics failing must never affect the app.
    console.warn("[analytics] init failed:", error && error.message);
    return false;
  }
}

export function trackEvent(event, properties = {}) {
  try {
    if (!client || !KNOWN_EVENTS.has(event)) return false;

    const safe = { source: "app" };
    for (const key of Object.keys(properties)) {
      if (!ALLOWED_PROPERTIES.has(key)) continue;
      const value = properties[key];
      const type = typeof value;
      if (type === "string" || type === "number" || type === "boolean") safe[key] = value;
    }

    client.capture(event, safe);
    return true;
  } catch {
    return false;
  }
}

// Id and role only. The Mongo user id is pseudonymous and meaningless outside
// the backend's database; the customer's name, email and phone are not sent.
export function identifyUser(user) {
  try {
    if (!client || !user) return;
    const id = user._id || user.id;
    if (!id) return;
    client.identify(String(id), { role: user.role || "customer" });
  } catch {
    // Identity is a convenience; failing to set it must not break sign-in.
  }
}

export function clearUser() {
  try {
    if (client) client.reset();
  } catch {
    // Ignored for the same reason as above.
  }
}

// Records a JS crash caught by ErrorBoundary.js.
//
// This is NOT a substitute for crash reporting - it is one event with a
// message, not a stack trace, a device profile or a release association. It
// exists so that a crash is at least COUNTABLE while the app has no Sentry,
// which makes "how often does this happen" answerable. Replace it with
// @sentry/react-native once EAS is set up.
export function trackCrash(error) {
  try {
    if (!client) return false;
    client.capture("app_error", {
      source: "app",
      // The message only, truncated, with nothing interpolated from it. No
      // stack trace: a React Native stack names bundle offsets that mean
      // nothing without a source map, and a message is enough to group by.
      failure_reason: String((error && error.message) || "unknown").slice(0, 200),
    });
    return true;
  } catch {
    return false;
  }
}

export async function flushAnalytics() {
  try {
    if (client) await client.flush();
    return true;
  } catch {
    return false;
  }
}

export { ALLOWED_PROPERTIES, KNOWN_EVENTS };
