// Tests the observability and third-party integration layer: Sentry, Brevo,
// Microsoft Teams alerting, PostHog, Upstash Redis, the health endpoints, and
// the failure behaviour of all of them.
//
// WHAT THIS SUITE IS MOSTLY ABOUT
//
// Not "does Sentry receive an event" - that would test Sentry. What matters
// here is the two properties this whole layer is built on, and both of them
// are only observable when a provider is BROKEN:
//
//   1. Nothing sensitive leaves the process. Checked against the real
//      scrubbers with realistic payloads, including the ones that arrive
//      under an innocent key name.
//   2. No third party can affect Printlly. Every provider is driven into
//      failure - timeout, 500, malformed response, thrown exception - and
//      the assertion is that the call returns rather than throws, and that
//      the business operation is untouched.
//
// NOTHING EXTERNAL IS CONTACTED. There are no real DSNs, API keys or webhook
// URLs here, and none is needed:
//
//   - Brevo goes through setEmailTransport, the same seam the push tests use
//     for Expo.
//   - Teams goes through a stubbed global fetch.
//   - Redis goes through setRedisClientForTests.
//   - Sentry is initialised against a syntactically valid DSN on a
//     non-routable host, so the SDK runs for real and its transport reaches
//     nothing.
//   - PostHog's sanitiser is a pure function and is tested directly.
//
// No email is sent, no card is posted, no event is captured off this machine.
//
// DATABASE USE: the email deduplication and retry sections need real
// MongoDB, because durable dedupe through a primary key is the entire point -
// an in-memory stand-in would test the stand-in. Everything it writes is
// created under a throwaway user and removed at the end; the cleanup is
// verified rather than assumed, and it never touches a real order, payment or
// user.
//
// Run with: node scripts/observabilityTest.js
require("dotenv").config();

// Set BEFORE anything is required: config/observability.js parses the
// environment once and caches it, so these have to be in place before the
// first module reads them.
process.env.UPSTASH_REDIS_REST_URL = "https://fake-upstash.invalid";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-not-real";
process.env.REDIS_KEY_PREFIX = "obstest";
process.env.TEAMS_WEBHOOK_URL = "https://teams.invalid/webhook/not-real";
process.env.ALERT_MIN_SEVERITY = "P2";
process.env.ALERT_DEDUPE_WINDOW_MS = "60000";
process.env.BREVO_API_KEY = "xkeysib-test-not-a-real-key";
process.env.BREVO_SENDER_EMAIL = "noreply@printlly.invalid";
process.env.BREVO_SENDER_NAME = "Printlly Test";
delete process.env.NODE_ENV;

const http = require("http");
const express = require("express");
const mongoose = require("mongoose");

const scrub = require("../utils/scrub");
const {
  observabilityConfig,
  sentryConfig,
  brevoConfig,
  teamsConfig,
  redisConfig,
  posthogConfig,
  serviceIdentity,
} = require("../config/observability");
const sentryModule = require("../utils/sentry");
const alerts = require("../utils/alerts");
const analytics = require("../utils/analytics");
const redisModule = require("../utils/redis");
const emailModule = require("../utils/email");
const healthRoutes = require("../routes/healthRoutes");
const healthController = require("../controllers/healthController");

const EmailDelivery = require("../models/EmailDelivery");
const User = require("../models/User");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};
const section = (title) => console.log(`\n--- ${title} ---`);

// Deep search for a literal anywhere in a structure, which is how a leak is
// actually detected: asserting on one field would miss the same value nested
// three levels down inside an `extra`.
function containsValue(haystack, needle, depth = 0) {
  if (depth > 10 || haystack === null || haystack === undefined) return false;
  if (typeof haystack === "string") return haystack.includes(needle);
  if (typeof haystack !== "object") return false;
  return Object.values(haystack).some((value) => containsValue(value, needle, depth + 1));
}

const UNIQUE = Date.now();
const testEmail = `obstest-${UNIQUE}@printlly.invalid`;
let testUserId = null;

// ===========================================================================
async function sectionScrubbing() {
  section("1. sensitive-data filtering (utils/scrub.js)");

  // Every one of these is a real field name from this codebase.
  const payload = {
    password: "hunter2",
    password_hash: "$2a$10$abcdefghijklmnop",
    new_password: "another-secret",
    authorization: "Bearer eyJhbGciOiJIUzI1NiI.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4",
    otp: "483920",
    razorpay_signature: "deadbeefcafe",
    jti: "a".repeat(64),
    email: "customer@example.com",
    phone: "+919876543210",
    public_id: "print_orders/abc123",
    file_url: "https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf",
    gst_number: "27AAPFU0939F1ZV",
    account_number: "123456789012",
    ifsc: "HDFC0001234",
    // Safe, and must survive - a report with every field redacted is useless.
    order_id: "66f1a2b3c4d5e6f7a8b9c0d1",
    total_amount: 250.5,
    status: "pending",
  };

  const scrubbed = scrub.scrub(payload);

  const mustNotLeak = [
    ["hunter2", "the plaintext password"],
    ["$2a$10$abcdefghijklmnop", "the bcrypt hash"],
    ["another-secret", "a new password"],
    ["483920", "the pickup OTP"],
    ["deadbeefcafe", "a Razorpay signature"],
    ["customer@example.com", "a customer email address"],
    ["+919876543210", "a phone number"],
    ["res.cloudinary.com", "a document URL"],
    ["27AAPFU0939F1ZV", "a GSTIN"],
    ["HDFC0001234", "an IFSC code"],
    ["123456789012", "a bank account number"],
    ["print_orders/abc123", "a Cloudinary public id"],
  ];

  for (const [value, what] of mustNotLeak) {
    check(!containsValue(scrubbed, value), `scrub removes ${what}`);
  }

  check(scrubbed.order_id === payload.order_id, "scrub keeps an order id (safe, and needed)");
  check(scrubbed.total_amount === 250.5, "scrub keeps a numeric amount");
  check(scrubbed.status === "pending", "scrub keeps a status");

  // A JWT under an innocent key - the case a key denylist alone would miss.
  const sneaky = scrub.scrub({ t: "eyJhbGciOiJIUzI1NiI.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4" });
  check(sneaky.t === "[JWT_REDACTED]", "scrub catches a JWT under a harmless key name");

  // A document URL inside a free-text error message.
  const message = scrub.scrubString(
    "upload failed for https://res.cloudinary.com/demo/raw/upload/v1/x.pdf after 2 tries"
  );
  check(
    !message.includes("cloudinary") && message.includes("after 2 tries"),
    "scrub removes a document URL from an error message but keeps the message"
  );

  check(
    scrub.scrubString("connect to mongodb+srv://user:pw@cluster.net/db failed").includes("[MONGODB_URI_REDACTED]"),
    "scrub removes a MongoDB connection string"
  );
  check(
    scrub.scrubString("POST https://outlook.office.com/webhook/abc failed").includes("[WEBHOOK_URL_REDACTED]"),
    "scrub removes a Teams webhook URL"
  );

  // Headers are an ALLOWLIST, so an unknown header must be dropped rather
  // than forwarded.
  const headers = scrub.scrubHeaders({
    authorization: "Bearer secret-token-value",
    cookie: "session=abc",
    "x-razorpay-signature": "sig",
    "content-type": "application/json",
    "x-some-future-cdn-header": "leaky-value",
  });
  check(headers.authorization === "[PRESENT]", "scrubHeaders records that auth was present, not its value");
  check(!containsValue(headers, "secret-token-value"), "scrubHeaders never forwards the token itself");
  check(headers["content-type"] === "application/json", "scrubHeaders keeps content-type");
  check(
    headers["x-some-future-cdn-header"] === undefined,
    "scrubHeaders DROPS an unknown header (allowlist, not denylist)"
  );

  check(
    scrub.scrubUrl("/orders/123?token=abc&page=2") === "/orders/123?token=[REDACTED]&page=[REDACTED]",
    "scrubUrl keeps parameter names and removes every value"
  );

  // Safety properties of the scrubber itself.
  const cyclic = { name: "x" };
  cyclic.self = cyclic;
  let threw = false;
  try {
    scrub.scrub(cyclic);
  } catch {
    threw = true;
  }
  check(!threw, "scrub survives a circular reference without throwing");

  const big = scrub.scrub({ note: "x".repeat(10000) });
  check(big.note.length < 600, "scrub truncates a very large string", `${big.note.length} chars`);

  const user = scrub.safeUser({ _id: "abc", role: "customer", email: "a@b.com", name: "Real Name" });
  check(
    user.id === "abc" && user.role === "customer" && !user.email && !user.name,
    "safeUser keeps id and role only"
  );
}

// ===========================================================================
async function sectionSentry() {
  section("2. Sentry");

  // Configuration, through the pure resolver so several environments can be
  // checked without re-initialising the SDK.
  check(sentryConfig({}).enabled === false, "Sentry is OFF when no DSN is set");
  check(
    sentryConfig({ SENTRY_DSN: "https://abc@o1.ingest.sentry.io/1", SENTRY_ENABLED: "false" }).enabled === false,
    "SENTRY_ENABLED=false switches Sentry off even with a DSN"
  );

  let malformed = false;
  try {
    sentryConfig({ SENTRY_DSN: "not-a-url" });
  } catch {
    malformed = true;
  }
  check(malformed, "a malformed SENTRY_DSN is rejected at configuration time, not at the first error");

  check(
    sentryConfig({ SENTRY_DSN: "https://abc@o1.ingest.sentry.io/1" }).tracesSampleRate === 0,
    "performance tracing defaults to OFF (quota protection)"
  );

  // The scrubbing chokepoint every outbound event passes through. Tested
  // directly, because this is the function that decides what Sentry stores.
  const event = sentryModule.sanitiseEvent({
    request: {
      method: "POST",
      url: "https://api.printlly.test/auth/login?token=leak",
      headers: { authorization: "Bearer abc.def.ghi", cookie: "a=b" },
      data: { email: "x@y.com", password: "hunter2" },
    },
    user: { id: "u1", role: "customer", email: "x@y.com", ip_address: "1.2.3.4" },
    extra: { otp: "111222", order_id: "o1" },
    message: "failed for https://res.cloudinary.com/x/raw/upload/a.pdf",
    exception: {
      values: [
        {
          value: "ValidationError: email x@y.com invalid",
          stacktrace: { frames: [{ filename: "a.js", vars: { password: "hunter2" } }] },
        },
      ],
    },
    breadcrumbs: [{ category: "http", data: { url: "https://res.cloudinary.com/x/raw/upload/a.pdf" } }],
  });

  check(!containsValue(event, "hunter2"), "beforeSend strips a password from request data AND stack frame vars");
  check(!containsValue(event, "cloudinary"), "beforeSend strips document URLs from message and breadcrumbs");
  check(!containsValue(event, "111222"), "beforeSend strips an OTP from extra");
  check(!containsValue(event, "1.2.3.4"), "beforeSend strips the IP address Sentry attaches by default");
  check(event.request.headers.authorization === "[PRESENT]", "beforeSend replaces the auth header with a marker");
  check(event.user.id === "u1" && !event.user.email, "beforeSend reduces the user to id and role");
  check(
    event.exception.values[0].stacktrace.frames[0].vars === undefined,
    "beforeSend removes stack-frame local variables entirely"
  );
  check(containsValue(event, "o1"), "beforeSend keeps the order id, which is what makes the report useful");

  // A sanitiser that throws must DROP the event rather than let an
  // unsanitised one through.
  const hostile = {};
  Object.defineProperty(hostile, "request", {
    get() {
      throw new Error("boom");
    },
  });
  check(sentryModule.sanitiseEvent(hostile) === null, "an event that cannot be sanitised is dropped, not sent");

  // Calls on a disabled SDK must be silent no-ops, not errors.
  check(sentryModule.isSentryActive() === false, "Sentry is inactive before init");
  check(sentryModule.captureError(new Error("x")) === null, "captureError is a no-op when Sentry is off");
  check(sentryModule.captureMessage("x") === null, "captureMessage is a no-op when Sentry is off");

  // Now initialise for real, against a DSN whose host does not resolve. The
  // SDK runs genuinely; its transport reaches nothing.
  process.env.SENTRY_DSN = "https://0123456789abcdef0123456789abcdef@o0.ingest.sentry.invalid/1";
  observabilityConfig(process.env, { fresh: true });
  // The module caches its own config, so re-read it the same way the real
  // startup path does.
  const started = sentryModule.initSentry();
  check(started === true, "initSentry starts the SDK when a DSN is present");
  check(sentryModule.isSentryActive() === true, "Sentry reports itself active after init");

  const eventId = sentryModule.captureError(new Error("observability test error"), {
    tags: { feature: "test" },
    order_id: "test-order",
  });
  check(typeof eventId === "string" && eventId.length > 0, "captureError returns an event id once active");

  // Does not hang when the transport cannot reach anything - the property
  // that matters on shutdown.
  const flushed = await sentryModule.flushSentry(800);
  check(typeof flushed === "boolean", "flushSentry resolves rather than hanging on an unreachable host");
}

// ===========================================================================
async function sectionTeams() {
  section("3. Teams alerting and failure handling");

  const realFetch = global.fetch;
  let calls = [];

  // The stub discriminates by host, and that matters.
  //
  // utils/alerts.js uses fetch for Teams AND, indirectly, for Upstash - the
  // Redis REST client is itself a fetch caller, and alert deduplication goes
  // through it. A stub that answered every request would have fed Upstash a
  // Teams-shaped response, and the dedupe claim would have failed for a
  // reason that had nothing to do with what was under test.
  //
  // Anything that is not the Teams webhook is rejected here, which also
  // leaves Redis genuinely unreachable - so this section exercises the
  // documented fallback: suppression falls back to the in-process map, which
  // errs towards DELIVERING rather than swallowing an alert.
  const TEAMS_HOST = "teams.invalid";
  const isTeams = (url) => String(url).includes(TEAMS_HOST);

  const stub = (impl) => {
    global.fetch = async (url, options) => {
      if (!isTeams(url)) throw new Error("non-Teams host blocked by the test stub");
      calls.push({ url, options });
      return impl();
    };
  };

  const ok = () => ({ ok: true, status: 200, text: async () => "1", json: async () => ({}) });

  // --- severity routing ---
  calls = [];
  stub(ok);
  const p3 = await alerts.alertP3({ reason: "test_p3", title: "P3", summary: "s" });
  check(p3.teams === false && calls.length === 0, "a P3 never reaches Teams (logs only)");

  calls = [];
  const p2 = await alerts.alertP2({ reason: "test_p2_" + UNIQUE, title: "P2", summary: "s" });
  check(p2.sentry === true, "a P2 reaches Sentry");

  calls = [];
  const p0 = await alerts.alertP0({ reason: "test_p0_" + UNIQUE, title: "P0", summary: "s" });
  check(p0.teams === true && calls.length === 1, "a P0 is delivered to Teams");
  check(p0.sentry === true, "a P0 also reaches Sentry");

  // --- the card never carries a secret ---
  const card = JSON.parse(calls[0].options.body);
  check(
    card.type === "message" && Array.isArray(card.attachments),
    "the default card is an Adaptive Card wrapped for a Power Automate workflow"
  );
  const built = alerts.buildAdaptiveCard({
    severity: "P0",
    title: "t",
    summary: "s",
    facts: { password: "hunter2", otp: "999111", order_id: "o1" },
    identity: serviceIdentity(),
  });
  check(!containsValue(built, "hunter2") && !containsValue(built, "999111"), "a card's facts are scrubbed");

  const scrubbedFacts = await alerts.alertP0({
    reason: "test_secrets_" + UNIQUE,
    title: "t",
    summary: "payload contained https://res.cloudinary.com/x/raw/upload/a.pdf",
    facts: { password: "hunter2", email: "a@b.com" },
  });
  const secretCard = JSON.parse(calls[calls.length - 1].options.body);
  check(
    !containsValue(secretCard, "hunter2") &&
      !containsValue(secretCard, "a@b.com") &&
      !containsValue(secretCard, "cloudinary"),
    "a delivered card contains no password, email or document URL"
  );
  check(scrubbedFacts.teams === true, "the scrubbed alert was still delivered");

  // --- deduplication ---
  calls = [];
  const dedupeReason = "test_dedupe_" + UNIQUE;
  const first = await alerts.alertP0({ reason: dedupeReason, title: "t", summary: "s" });
  const second = await alerts.alertP0({ reason: dedupeReason, title: "t", summary: "s" });
  check(first.teams === true, "the first alert of a kind is delivered");
  check(
    second.teams === false && second.suppressed === true,
    "an identical alert inside the window is suppressed - one failing dependency does not flood the channel"
  );
  check(calls.length === 1, "only one card was actually posted", `${calls.length} posts`);

  // A different subject of the same reason must still get through, or a
  // per-order anomaly would be reported once ever.
  calls = [];
  const a = await alerts.alertP0({ reason: dedupeReason, title: "t", summary: "s", dedupeKey: "order-A" });
  const b = await alerts.alertP0({ reason: dedupeReason, title: "t", summary: "s", dedupeKey: "order-B" });
  check(a.teams === true && b.teams === true, "the same reason for a different subject is NOT suppressed");

  // --- failure handling: the point of the whole section ---
  calls = [];
  stub(() => ({ ok: false, status: 500, text: async () => "upstream boom", json: async () => ({}) }));
  const onFiveHundred = await alerts.alertP0({ reason: "test_500_" + UNIQUE, title: "t", summary: "s" });
  check(onFiveHundred.teams === false, "a Teams 500 is reported as undelivered");
  check(onFiveHundred.sentry === true, "the alert still reached Sentry when Teams failed");

  global.fetch = async (url) => {
    if (!isTeams(url)) throw new Error("non-Teams host blocked by the test stub");
    throw new Error("network unreachable");
  };
  let alertThrew = false;
  let networkResult = null;
  try {
    networkResult = await alerts.alertP0({ reason: "test_net_" + UNIQUE, title: "t", summary: "s" });
  } catch {
    alertThrew = true;
  }
  check(!alertThrew, "a network failure posting to Teams does not throw into the caller");
  check(networkResult && networkResult.teams === false, "a network failure is reported as undelivered");

  // A hung endpoint must time out rather than hold the caller open.
  process.env.TEAMS_TIMEOUT_MS = "300";
  observabilityConfig(process.env, { fresh: true });
  global.fetch = async (url, options) => {
    if (!isTeams(url)) throw new Error("non-Teams host blocked by the test stub");
    return new Promise((resolve, reject) => {
      if (options && options.signal) {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }
    });
  };
  const startedAt = Date.now();
  const timedOut = await alerts.alertP0({ reason: "test_timeout_" + UNIQUE, title: "t", summary: "s" });
  const elapsed = Date.now() - startedAt;
  check(timedOut.teams === false, "a hung Teams endpoint is reported as undelivered");
  check(elapsed < 3000, "a hung Teams endpoint times out quickly rather than blocking", `${elapsed}ms`);

  global.fetch = realFetch;
  delete process.env.TEAMS_TIMEOUT_MS;
  observabilityConfig(process.env, { fresh: true });

  // --- error-rate tracking ---
  alerts.resetErrorWindow();
  let last = null;
  for (let i = 0; i < 9; i += 1) last = alerts.recordServerError({ threshold: 10 });
  check(last.exceeded === false, "nine 5xx in the window does not trip the error-rate alert");
  last = alerts.recordServerError({ threshold: 10 });
  check(last.exceeded === true, "the tenth 5xx trips it - a burst, not a single error, is the signal");
  alerts.resetErrorWindow();
  check(alerts.recordServerError({ threshold: 10 }).count === 1, "the window resets cleanly");

  // --- threshold configuration ---
  check(teamsConfig({ TEAMS_WEBHOOK_URL: "https://x.invalid/w" }).minSeverity === "P1", "ALERT_MIN_SEVERITY defaults to P1");
  let badSeverity = false;
  try {
    teamsConfig({ ALERT_MIN_SEVERITY: "URGENT" });
  } catch {
    badSeverity = true;
  }
  check(badSeverity, "an invalid ALERT_MIN_SEVERITY stops the boot rather than silently defaulting");

  let httpWebhook = false;
  try {
    teamsConfig({ TEAMS_WEBHOOK_URL: "http://insecure.invalid/webhook" });
  } catch {
    httpWebhook = true;
  }
  check(httpWebhook, "an http:// Teams webhook is refused - the URL is a credential");
}

// ===========================================================================
async function sectionPosthog() {
  section("4. PostHog event sanitisation");

  const sanitise = analytics.sanitiseProperties;

  const out = sanitise({
    // Allowed
    order_id: "o1",
    shop_id: "s1",
    page_count: 12,
    total_amount: 250,
    status: "pending",
    // Not on the allowlist, and each one a real field from this codebase
    email: "a@b.com",
    phone: "+919876543210",
    customer_name: "Real Name",
    shop_name: "Raj Xerox",
    otp: "483920",
    file_url: "https://res.cloudinary.com/x/raw/upload/a.pdf",
    original_name: "mri-results.pdf",
    latitude: 12.97,
    longitude: 77.59,
    razorpay_payment_id: "pay_abc",
    password: "hunter2",
  });

  check(out.order_id === "o1" && out.page_count === 12 && out.total_amount === 250, "allowed properties pass through");
  for (const key of [
    "email",
    "phone",
    "customer_name",
    "shop_name",
    "otp",
    "file_url",
    "original_name",
    "latitude",
    "longitude",
    "razorpay_payment_id",
    "password",
  ]) {
    check(out[key] === undefined, `PostHog drops "${key}" (not on the allowlist)`);
  }
  check(!containsValue(out, "mri-results.pdf"), "a document filename never reaches PostHog");

  // Nested objects under an allowed name are dropped: scalars only, so an
  // unreviewed payload cannot ride along.
  const nested = sanitise({ status: { nested: "object" }, order_id: ["a", "b"] });
  check(
    nested.status === undefined && nested.order_id === undefined,
    "a non-scalar under an allowed name is dropped"
  );

  // Value-level scrubbing as well as name-level, so an allowed name carrying
  // a leaked value is still caught.
  const leaky = sanitise({ status: "failed: https://res.cloudinary.com/x/raw/upload/a.pdf" });
  check(
    typeof leaky.status === "string" && !leaky.status.includes("cloudinary"),
    "an allowed property's VALUE is scrubbed too"
  );

  // Inactive client: every call is a silent no-op.
  check(analytics.isAnalyticsActive() === false, "analytics is inactive when unconfigured");
  check(
    analytics.trackEvent({ event: analytics.EVENTS.ORDER_CREATED, userId: "u1" }) === false,
    "trackEvent is a no-op when PostHog is off"
  );
  let trackThrew = false;
  try {
    analytics.trackEvent({ event: "nonsense_event", userId: "u1" });
    analytics.trackEvent({ event: analytics.EVENTS.ORDER_CREATED, userId: null });
    analytics.trackEvent({});
  } catch {
    trackThrew = true;
  }
  check(!trackThrew, "trackEvent never throws, even on nonsense input");

  check(posthogConfig({}).enabled === false, "PostHog is OFF when no key is set");
  check(
    posthogConfig({ POSTHOG_API_KEY: "phc_x", POSTHOG_ENABLED: "false" }).enabled === false,
    "POSTHOG_ENABLED=false switches it off even with a key"
  );
  check(await analytics.flushAnalytics(), "flushAnalytics resolves when inactive");
}

// ===========================================================================
async function sectionRedis() {
  section("5. Redis: rate limiting, locks and outage behaviour");

  check(redisModule.isRedisEnabled() === true, "Redis is enabled by the test environment");

  // A fake client. The important thing is that it can be made to fail on
  // demand - the outage path is the one worth testing.
  const store = new Map();
  let failing = false;
  let hanging = false;

  const fake = {
    async set(key, value, options) {
      if (failing) throw new Error("upstash unreachable");
      if (options && options.nx && store.has(key)) return null;
      store.set(key, { value, expiresAt: Date.now() + (options && options.px ? options.px : 60000) });
      return "OK";
    },
    async get(key) {
      if (failing) throw new Error("upstash unreachable");
      const entry = store.get(key);
      return entry ? entry.value : null;
    },
    async del(key) {
      if (failing) throw new Error("upstash unreachable");
      store.delete(key);
      return 1;
    },
    async incr(key) {
      if (failing) throw new Error("upstash unreachable");
      const entry = store.get(key) || { value: 0, expiresAt: null };
      entry.value = Number(entry.value) + 1;
      store.set(key, entry);
      return entry.value;
    },
    async decr(key) {
      if (failing) throw new Error("upstash unreachable");
      const entry = store.get(key) || { value: 0, expiresAt: null };
      entry.value = Number(entry.value) - 1;
      store.set(key, entry);
      return entry.value;
    },
    async pttl(key) {
      if (failing) throw new Error("upstash unreachable");
      const entry = store.get(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      return Math.max(0, entry.expiresAt - Date.now());
    },
    async pexpire(key, ms) {
      if (failing) throw new Error("upstash unreachable");
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + ms;
      return 1;
    },
    async ping() {
      if (hanging) return new Promise(() => {});
      if (failing) throw new Error("upstash unreachable");
      return "PONG";
    },
    pipeline() {
      const queued = [];
      const self = this;
      const api = {
        incr(key) {
          queued.push(() => self.incr(key));
          return api;
        },
        pttl(key) {
          queued.push(() => self.pttl(key));
          return api;
        },
        async exec() {
          const results = [];
          for (const op of queued) results.push(await op());
          return results;
        },
      };
      return api;
    },
  };

  redisModule.setRedisClientForTests(fake);

  // --- primitives ---
  const claimed = await redisModule.redisSetIfAbsent("t:" + UNIQUE, "1", 5000);
  const again = await redisModule.redisSetIfAbsent("t:" + UNIQUE, "1", 5000);
  check(claimed === true, "redisSetIfAbsent returns true for the caller that set the key");
  check(again === false, "redisSetIfAbsent returns false when the key already exists");

  const counter = await redisModule.redisIncrementWindow("c:" + UNIQUE, 10000);
  check(counter && counter.count === 1, "redisIncrementWindow starts a window at 1");
  const counter2 = await redisModule.redisIncrementWindow("c:" + UNIQUE, 10000);
  check(counter2.count === 2, "redisIncrementWindow increments within the window");
  check(counter2.resetAt instanceof Date, "redisIncrementWindow reports when the window resets");

  // --- the three-way return is the whole design ---
  failing = true;
  const whenDown = await redisModule.redisSetIfAbsent("x:" + UNIQUE, "1", 1000);
  check(whenDown === null, "a Redis failure returns null - NOT a plausible-looking default");
  check((await redisModule.redisGet("x")) === null, "redisGet returns null when Redis is down");
  check((await redisModule.redisIncrementWindow("x", 1000)) === null, "redisIncrementWindow returns null when down");

  let redisThrew = false;
  try {
    await redisModule.redisSet("x", "1", 1000);
    await redisModule.redisDel("x");
    await redisModule.redisDecrement("x");
  } catch {
    redisThrew = true;
  }
  check(!redisThrew, "no Redis helper throws when Redis is unavailable");
  failing = false;

  // --- rate-limit store: the degradation path ---
  const RedisStore = redisModule.RedisRateLimitStore;
  const limiterStore = new RedisStore("TESTPOLICY");
  limiterStore.init({ windowMs: 60000 });

  const hit1 = await limiterStore.increment("user:abc");
  const hit2 = await limiterStore.increment("user:abc");
  check(hit1.totalHits === 1 && hit2.totalHits === 2, "the Redis store counts hits for a key");
  check(hit2.resetTime instanceof Date, "the Redis store reports a reset time");

  // Namespacing, which is what stops two policies sharing one bucket.
  const otherPolicy = new RedisStore("OTHERPOLICY");
  otherPolicy.init({ windowMs: 60000 });
  const otherHit = await otherPolicy.increment("user:abc");
  check(
    otherHit.totalHits === 1,
    "the SAME key under a different policy has its own counter - browsing does not spend an order allowance"
  );

  await limiterStore.decrement("user:abc");
  const afterRefund = await limiterStore.increment("user:abc");
  check(afterRefund.totalHits === 2, "decrement refunds an attempt (used by the pickup-OTP limiter)");

  // The degradation: a Redis outage must fall back to per-process counters,
  // neither rejecting everything nor allowing everything.
  failing = true;
  const degraded1 = await limiterStore.increment("user:degraded");
  const degraded2 = await limiterStore.increment("user:degraded");
  check(
    degraded1 && typeof degraded1.totalHits === "number",
    "a Redis outage still returns a usable count - the limiter does not fail open"
  );
  check(degraded2.totalHits === 2, "the in-process fallback keeps counting during the outage");
  check(limiterStore.usingFallback === true, "the store records that it has degraded");

  failing = false;
  const recovered = await limiterStore.increment("user:abc");
  check(recovered.totalHits >= 1 && limiterStore.usingFallback === false, "the store returns to shared counters");

  // --- locks ---
  const lockName = "lock-test-" + UNIQUE;
  let ran = 0;
  const firstLock = await redisModule.withLock(lockName, 5000, async () => {
    ran += 1;
    // A second attempt while the first holds the lock.
    const inner = await redisModule.withLock(lockName, 5000, async () => {
      ran += 1;
    });
    return inner;
  });
  check(firstLock.ran === true, "withLock runs the work for the holder");
  check(firstLock.value && firstLock.value.ran === false, "a second caller does not run while the lock is held");
  check(ran === 1, "the locked work ran exactly once");

  // A Redis outage must not stop the cron jobs that use locks.
  failing = true;
  let degradedRan = false;
  const degradedLock = await redisModule.withLock("x", 1000, async () => {
    degradedRan = true;
  });
  check(
    degradedRan === true && degradedLock.degraded === true,
    "with Redis down, locked work runs ANYWAY and is marked degraded - an outage must not halt cleanup"
  );
  failing = false;

  // --- health ---
  const healthy = await redisModule.pingRedis();
  check(healthy.enabled === true && healthy.ok === true, "pingRedis reports a healthy Redis");
  failing = true;
  const unhealthy = await redisModule.pingRedis();
  check(unhealthy.ok === false, "pingRedis reports an unhealthy Redis without throwing");
  failing = false;

  const reported = redisModule.getRedisHealth();
  check(
    reported.enabled === true && typeof reported.consecutiveFailures === "number",
    "getRedisHealth reports state"
  );
  check(
    !containsValue(reported, "fake-upstash") && !containsValue(reported, "test-token-not-real"),
    "getRedisHealth never exposes the Redis URL or token"
  );

  // --- configuration safety ---
  let partial = false;
  try {
    redisConfig({ UPSTASH_REDIS_REST_URL: "https://x.invalid" });
  } catch {
    partial = true;
  }
  check(partial, "a half-configured Redis stops the boot");

  let tcpUrl = false;
  try {
    redisConfig({ REDIS_URL: "redis://localhost:6379" });
  } catch {
    tcpUrl = true;
  }
  check(
    tcpUrl,
    "a redis:// URL is refused rather than ignored - silently using per-process counters would be a security regression"
  );

  redisModule.setRedisClientForTests(null);
}

// ===========================================================================
async function sectionEmail() {
  section("6. Brevo email: dedupe, failure handling and retry");

  check(brevoConfig({}).enabled === false, "Brevo is OFF when unconfigured");
  let partialBrevo = false;
  try {
    brevoConfig({ BREVO_API_KEY: "x" });
  } catch {
    partialBrevo = true;
  }
  check(partialBrevo, "a partially configured Brevo stops the boot with a named error");
  let badSender = false;
  try {
    brevoConfig({ BREVO_API_KEY: "x", BREVO_SENDER_EMAIL: "not-an-email", BREVO_SENDER_NAME: "n" });
  } catch {
    badSender = true;
  }
  check(badSender, "a malformed BREVO_SENDER_EMAIL stops the boot");

  check(emailModule.classifyFailure(429) === "transient", "a 429 is transient (retryable)");
  check(emailModule.classifyFailure(503) === "transient", "a provider 5xx is transient");
  check(emailModule.classifyFailure(0) === "transient", "a network error is transient");
  check(emailModule.classifyFailure(400) === "permanent", "a 400 is permanent - retrying would be refused identically");
  check(emailModule.classifyFailure(401) === "permanent", "bad credentials are permanent");

  // ---- templates: what must never be in an email body ----
  const sample = {
    customerName: "Test Customer",
    vendorName: "Test Vendor",
    shopName: "Test Shop",
    orderRef: "ABCD1234",
    amount: 250,
    vendorAmount: 230,
    orderCount: 3,
    reason: "blurry documents",
  };
  let templatesChecked = 0;
  let otpLeak = false;
  let urlLeak = false;
  for (const [name, template] of Object.entries(emailModule.TEMPLATES)) {
    const html = template.html(sample);
    const subject = template.subject(sample);
    templatesChecked += 1;
    if (/\b\d{6}\b/.test(html)) otpLeak = true;
    if (/cloudinary|\/raw\/upload\//i.test(html)) urlLeak = true;
    if (typeof subject !== "string" || subject.length === 0) {
      check(false, `template ${name} has a subject`);
    }
  }
  check(templatesChecked === 12, "all 12 email templates render", `${templatesChecked}`);
  check(!otpLeak, "no email template contains anything shaped like a pickup OTP");
  check(!urlLeak, "no email template contains a document URL");

  const confirmed = emailModule.TEMPLATES.order_confirmed.html(sample);
  check(
    confirmed.includes("pickup code") && confirmed.includes("do not include it in email"),
    "the order confirmation explains that the OTP is in the app, rather than including it"
  );
  check(
    emailModule.TEMPLATES.vendor_settlement_paid.html(sample).includes("does not move money"),
    "the settlement email does not claim Printlly transferred the money"
  );

  // HTML escaping, since shop and customer names are user-controlled.
  const hostile = emailModule.TEMPLATES.order_accepted.html({
    ...sample,
    shopName: '<script>alert(1)</script>& "quoted"',
  });
  check(
    !hostile.includes("<script>") && hostile.includes("&lt;script&gt;"),
    "a shop name containing markup is escaped, not injected"
  );

  check(emailModule.toPlainText("<p>Hello</p><p>World</p>").includes("Hello"), "a text/plain alternative is generated");

  // ---- sending, with a substituted transport ----
  const sent = [];
  emailModule.setEmailTransport(async ({ to, subject, html, text }) => {
    sent.push({ to, subject, html, text });
    return { ok: true, status: 201, messageId: "<test-" + sent.length + ">" };
  });

  const user = await User.create({
    name: "Observability Test User",
    email: testEmail,
    phone: "9" + String(UNIQUE).slice(-9),
    password_hash: "$2a$10$notarealhashnotarealhashnotarealhash",
    role: "customer",
  });
  testUserId = user._id;

  const dedupeSubject = "obstest-order-" + UNIQUE;

  const firstSend = await emailModule.sendTransactionalEmail({
    event: "order_confirmed",
    userId: user._id,
    params: sample,
    dedupeId: dedupeSubject,
  });
  check(firstSend.sent === true, "a transactional email is sent", firstSend.outcome);
  check(sent.length === 1 && sent[0].to === testEmail, "it went to the address on the user record");
  check(sent[0].text && sent[0].text.length > 0, "it carried a text/plain part");

  // THE key property: the same event for the same subject sends once, ever.
  const secondSend = await emailModule.sendTransactionalEmail({
    event: "order_confirmed",
    userId: user._id,
    params: sample,
    dedupeId: dedupeSubject,
  });
  check(
    secondSend.sent === false && secondSend.outcome === "duplicate",
    "a repeat of the same event is refused as a duplicate"
  );
  check(sent.length === 1, "no second email was transmitted", `${sent.length} sent`);

  // Durability: the dedupe record is in MongoDB, so it survives a restart.
  const record = await EmailDelivery.findById("order_confirmed:" + dedupeSubject).lean();
  check(record && record.status === "sent", "the dedupe record is durable in MongoDB, not in memory");
  check(
    record && !record.recipient && !containsValue(record, testEmail),
    "the dedupe record stores the user reference, NOT their email address"
  );

  // A different event for the same order is a different email.
  const differentEvent = await emailModule.sendTransactionalEmail({
    event: "order_ready",
    userId: user._id,
    params: sample,
    dedupeId: dedupeSubject,
  });
  check(differentEvent.sent === true, "a different event for the same order is still sent");

  // ---- failure handling ----
  emailModule.setEmailTransport(async () => ({ ok: false, status: 503, error: "HTTP 503 upstream" }));
  const transient = await emailModule.sendTransactionalEmail({
    event: "order_accepted",
    userId: user._id,
    params: sample,
    dedupeId: dedupeSubject,
  });
  check(transient.sent === false && transient.outcome === "retrying", "a transient failure is queued for retry");
  const retryRecord = await EmailDelivery.findById("order_accepted:" + dedupeSubject).lean();
  check(
    retryRecord && retryRecord.status === "retrying" && retryRecord.next_attempt_at,
    "the retry is scheduled with a backoff"
  );

  emailModule.setEmailTransport(async () => ({ ok: false, status: 400, error: "invalid recipient" }));
  const permanent = await emailModule.sendTransactionalEmail({
    event: "order_completed",
    userId: user._id,
    params: sample,
    dedupeId: dedupeSubject,
  });
  check(
    permanent.sent === false && permanent.outcome === "failed",
    "a permanent failure is NOT retried - the same request would be refused identically"
  );

  emailModule.setEmailTransport(async () => {
    throw new Error("transport exploded");
  });
  let emailThrew = false;
  let thrownResult = null;
  try {
    thrownResult = await emailModule.sendTransactionalEmail({
      event: "order_expired",
      userId: user._id,
      params: sample,
      dedupeId: dedupeSubject,
    });
  } catch {
    emailThrew = true;
  }
  check(!emailThrew, "a transport that THROWS does not propagate into the caller");
  check(thrownResult && thrownResult.sent === false, "it is reported as not sent");

  // ---- retry pass ----
  emailModule.setEmailTransport(async () => ({ ok: true, status: 201, messageId: "<retried>" }));
  await EmailDelivery.updateOne(
    { _id: "order_accepted:" + dedupeSubject },
    { $set: { next_attempt_at: new Date(Date.now() - 1000) } }
  );
  const retrySummary = await emailModule.retryFailedEmails({ limit: 10 });
  check(retrySummary.attempted >= 1, "the retry pass picks up a due email", JSON.stringify(retrySummary));
  const afterRetry = await EmailDelivery.findById("order_accepted:" + dedupeSubject).lean();
  check(afterRetry && afterRetry.status === "sent", "a retried email is marked sent");

  // ---- unknown event and missing recipient ----
  const unknown = await emailModule.sendTransactionalEmail({
    event: "no_such_template",
    userId: user._id,
    dedupeId: "x" + UNIQUE,
  });
  check(unknown.sent === false && unknown.outcome === "unknown_event", "an unknown event is refused, not thrown");

  const noRecipient = await emailModule.sendTransactionalEmail({
    event: "order_ready",
    userId: new mongoose.Types.ObjectId(),
    params: sample,
    dedupeId: "orphan-" + UNIQUE,
  });
  check(
    noRecipient.sent === false && noRecipient.outcome === "no_recipient",
    "an email for a user who no longer exists is dropped cleanly"
  );

  emailModule.setEmailTransport(null);
}

// ===========================================================================
async function sectionHealth() {
  section("7. health endpoints");

  const app = express();
  app.use("/health", healthRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const get = async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, headers: response.headers };
  };

  const live = await get("/health");
  check(live.status === 200, "GET /health returns 200", `got ${live.status}`);
  check(live.body.status === "ok", 'GET /health returns {"status":"ok"}', JSON.stringify(live.body));
  check(
    Object.keys(live.body).length === 1,
    "GET /health returns NOTHING else - no version, no hostname, no uptime",
    JSON.stringify(live.body)
  );

  const ready = await get("/health/ready");
  check(ready.status === 200, "GET /health/ready returns 200 when the database is reachable", `got ${ready.status}`);
  check(ready.body.status === "ok", "it reports ok");

  // The response must never name a dependency, a host or an error. Both
  // endpoints are unauthenticated, so their bodies are treated as public.
  const FORBIDDEN_IN_BODY = [
    ["mongodb", "MongoDB by name"],
    ["cluster", "a cluster name"],
    ["upstash", "Upstash by name"],
    ["localhost", "a hostname"],
    ["error", "an error"],
    ["readystate", "driver internals"],
  ];
  for (const [needle, what] of FORBIDDEN_IN_BODY) {
    check(
      !JSON.stringify(ready.body).toLowerCase().includes(needle),
      `the readiness response does not expose ${what}`
    );
  }

  // Readiness FAILURE, driven by removing required configuration. This is a
  // real 503, not a simulated one.
  const savedSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  const notReady = await get("/health/ready");
  process.env.JWT_SECRET = savedSecret;

  check(notReady.status === 503, "GET /health/ready returns 503 when required configuration is missing", `got ${notReady.status}`);
  check(notReady.body.status === "not_ready", 'it returns {"status":"not_ready"}', JSON.stringify(notReady.body));
  check(
    !JSON.stringify(notReady.body).includes("JWT_SECRET"),
    "the 503 does NOT name which setting is missing - that detail goes to the log and Sentry"
  );
  check(
    Object.keys(notReady.body).length === 1,
    "the 503 body carries nothing but the status",
    JSON.stringify(notReady.body)
  );

  const restored = await get("/health/ready");
  check(restored.status === 200, "readiness recovers once configuration is restored");

  // The configuration check itself.
  const configCheck = healthController.checkConfiguration();
  check(configCheck.ok === true, "checkConfiguration passes with a complete environment");

  const mongoCheck = await healthController.checkMongo();
  check(mongoCheck.ok === true, "checkMongo confirms the database answers a ping");

  await new Promise((resolve) => server.close(resolve));
}

// ===========================================================================
async function sectionOutages() {
  section("8. third-party outage scenarios (nothing may take Printlly down)");

  // Every integration unconfigured - which must behave exactly like every
  // provider being down.
  const bare = {
    sentry: sentryConfig({}),
    brevo: brevoConfig({}),
    teams: teamsConfig({}),
    posthog: posthogConfig({}),
    redis: redisConfig({}),
  };
  for (const [name, config] of Object.entries(bare)) {
    check(config.enabled === false, `${name} is OFF in a bare environment`);
  }

  // The real emitOrderEvent fan-out, with a provider failing. The property
  // under test is that it returns a result rather than throwing - an order is
  // accepted whether or not anyone can be told.
  const { emitOrderEvent, ORDER_EVENTS } = require("../utils/orderEvents");

  emailModule.setEmailTransport(async () => {
    throw new Error("Brevo is down");
  });

  const fakeOrder = {
    _id: new mongoose.Types.ObjectId(),
    customer_id: testUserId || new mongoose.Types.ObjectId(),
    shop_id: new mongoose.Types.ObjectId(),
    status: "pending",
    payment_status: "paid",
    total_amount: 100,
    vendor_amount: 90,
  };

  let emitThrew = false;
  let emitResult = null;
  try {
    emitResult = await emitOrderEvent(fakeOrder, ORDER_EVENTS.PAYMENT_CONFIRMED);
  } catch {
    emitThrew = true;
  }
  check(!emitThrew, "emitOrderEvent does not throw when the email provider is down");
  check(emitResult !== null, "emitOrderEvent returns a result regardless");

  // An unknown event must be refused rather than crash the caller.
  let unknownThrew = false;
  try {
    await emitOrderEvent(fakeOrder, "NOT_A_REAL_EVENT");
  } catch {
    unknownThrew = true;
  }
  check(!unknownThrew, "emitOrderEvent refuses an unknown event without throwing");

  emailModule.setEmailTransport(null);

  // Alerting while everything is broken at once.
  const realFetch = global.fetch;
  // Here EVERYTHING is blocked on purpose - that is the scenario.
  global.fetch = async () => {
    throw new Error("the whole internet is down");
  };
  redisModule.setRedisClientForTests({
    async set() {
      throw new Error("redis down");
    },
    async get() {
      throw new Error("redis down");
    },
    async del() {
      throw new Error("redis down");
    },
  });

  let everythingThrew = false;
  let result = null;
  try {
    result = await alerts.alertP0({
      reason: "test_total_outage_" + UNIQUE,
      title: "everything is down",
      summary: "s",
      error: new Error("original failure"),
    });
  } catch {
    everythingThrew = true;
  }
  check(!everythingThrew, "alerting with BOTH Teams and Redis down does not throw");
  check(result && result.teams === false, "it reports Teams as undelivered");
  check(
    result && result.sentry === true,
    "the alert still reached Sentry - the one channel left standing"
  );

  global.fetch = realFetch;
  redisModule.setRedisClientForTests(null);
}

// ===========================================================================
async function sectionRazorpayMonitoring() {
  section("9. Razorpay monitoring");

  const webhook = require("../controllers/paymentWebhookController");

  // The existing signature verification, re-confirmed because the alerting
  // added around it must not have changed it.
  const crypto = require("crypto");
  const secret = "test_webhook_secret";
  const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: {} }));
  const valid = crypto.createHmac("sha256", secret).update(body).digest("hex");

  check(webhook.verifyWebhookSignature(body, valid, secret) === true, "a correct signature still verifies");
  check(
    webhook.verifyWebhookSignature(Buffer.from(body.toString() + " "), valid, secret) === false,
    "one extra byte invalidates the signature"
  );
  check(webhook.verifyWebhookSignature(body, valid, "wrong_secret") === false, "a wrong secret fails");
  check(webhook.verifyWebhookSignature(body, "", secret) === false, "an empty signature fails");
  check(webhook.verifyWebhookSignature(body, valid, "") === false, "an unset webhook secret fails closed");
  check(webhook.verifyWebhookSignature("not a buffer", valid, secret) === false, "a non-Buffer body fails");
  check(
    webhook.safeCompareHex("aabb", "aab") === false,
    "a truncated signature is refused without throwing in timingSafeEqual"
  );

  // The alert vocabulary the webhook uses must actually exist - a typo here
  // would mean an alert that never groups or dedupes.
  for (const key of [
    "PAYMENT_WEBHOOK_FAILURE",
    "PAYMENT_AMOUNT_MISMATCH",
    "PAYMENT_VERIFICATION_ANOMALY",
    "PAYMENT_ORDER_NOT_FOUND",
  ]) {
    check(typeof alerts.ALERT[key] === "string", `ALERT.${key} is defined`);
  }

  // Severity ordering, which decides who is woken up.
  check(alerts.severityRank("P0") < alerts.severityRank("P1"), "P0 outranks P1");
  check(alerts.severityRank("P1") < alerts.severityRank("P2"), "P1 outranks P2");
  check(alerts.severityRank("P2") < alerts.severityRank("P3"), "P2 outranks P3");

  // An amount mismatch must never be reported with the customer's details
  // attached, and the facts a card carries are scrubbed.
  const card = alerts.buildAdaptiveCard({
    severity: "P0",
    title: "amount mismatch",
    summary: "s",
    facts: { order_id: "o1", expected_paise: 25000, reported_paise: 100, email: "a@b.com" },
    identity: serviceIdentity(),
  });
  check(containsValue(card, "25000"), "a mismatch card reports the expected amount");
  check(!containsValue(card, "a@b.com"), "a mismatch card carries no customer email");
}

// ===========================================================================
async function cleanup() {
  section("10. cleanup (no test data may be left behind)");

  const emailRecords = await EmailDelivery.deleteMany({
    _id: { $regex: "obstest-|orphan-|^x" + UNIQUE },
  });
  check(true, "removed test email-delivery records", `${emailRecords.deletedCount} deleted`);

  if (testUserId) {
    await User.deleteOne({ _id: testUserId });
    const stillThere = await User.exists({ _id: testUserId });
    check(!stillThere, "the throwaway test user was removed");
  }

  // Notifications created by the emitOrderEvent outage test, which writes a
  // real Notification for the fake order.
  const Notification = require("../models/Notification");
  const orphanNotifications = await Notification.deleteMany({ user_id: testUserId });
  check(true, "removed notifications created by the outage test", `${orphanNotifications.deletedCount} deleted`);

  const leftoverEmails = await EmailDelivery.countDocuments({ _id: { $regex: String(UNIQUE) } });
  check(leftoverEmails === 0, "no email-delivery records for this run remain", `${leftoverEmails} left`);
}

// ===========================================================================
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Recorded so the cleanup assertions can prove nothing real was touched.
  const usersBefore = await User.countDocuments();
  const Order = require("../models/Order");
  const ordersBefore = await Order.countDocuments();

  await sectionScrubbing();
  await sectionSentry();
  await sectionTeams();
  await sectionPosthog();
  await sectionRedis();
  await sectionEmail();
  await sectionHealth();
  await sectionOutages();
  await sectionRazorpayMonitoring();
  await cleanup();

  section("11. the database is as it was");
  const usersAfter = await User.countDocuments();
  const ordersAfter = await Order.countDocuments();
  check(usersAfter === usersBefore, "the user count is unchanged", `${usersBefore} -> ${usersAfter}`);
  check(ordersAfter === ordersBefore, "the order count is unchanged - no order was created or touched", `${ordersBefore} -> ${ordersAfter}`);

  await mongoose.disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => {
    // Sentry's transport and PostHog's flush timer can both hold the event
    // loop open; exit explicitly once the assertions are done.
    setTimeout(() => process.exit(process.exitCode || 0), 150);
  })
  .catch((error) => {
    console.error("\nobservabilityTest crashed:", error);
    process.exit(1);
  });
