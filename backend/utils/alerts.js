// Critical alerting: the path from "something is broken" to "a human knows".
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// Microsoft Teams is an alert DESTINATION. It is not the monitoring system.
// Nothing in this application asks Teams whether something is wrong; Teams
// receives a card when this application has already decided a human needs to
// act. That distinction matters because it sets the bar: if a card does not
// warrant interrupting someone, it does not belong here.
//
// SEVERITY ROUTING
//
//   P0  Teams + Sentry   Printlly is broken or losing money. Page now.
//                        MongoDB unreachable, payment confirmations failing,
//                        the authentication system refusing everyone.
//   P1  Teams + Sentry   Degraded. Someone should look today.
//                        A dependency is down but orders still complete.
//   P2  Sentry only      A real, handled error. Worth a trend, not a ping.
//   P3  Logs + Sentry    Notable but expected. A single email bounce.
//
// The reason the ladder exists at all is alert fatigue, which is a failure
// mode and not a nuisance: a channel that fires on every ordinary 500 gets
// muted within a week, and the P0 that follows is seen the next morning. So
// ordinary application errors deliberately DO NOT reach Teams - they go to
// Sentry, where a trend is visible without anyone being interrupted.
//
// DEDUPLICATION
//
// A failing dependency does not fail once. MongoDB going away produces an
// error per request, which without suppression is hundreds of identical
// cards - and an unreadable channel during exactly the incident it exists
// for. Every alert therefore carries a `key`, and the same key is suppressed
// for ALERT_DEDUPE_WINDOW_MS after being sent.
//
// The suppression state lives in Redis when Redis is configured, so that
// four application instances send one card between them rather than four.
// It falls back to a per-process map when Redis is absent - which
// over-sends rather than under-sends, the correct direction for an alerting
// control to fail in.

const { observabilityConfig, SEVERITIES } = require("../config/observability");
const { captureError, captureMessage } = require("./sentry");
const { scrub, scrubString } = require("./scrub");
const { redisSetIfAbsent, isRedisEnabled } = require("./redis");

// Known alert reasons, named rather than free-form.
//
// A fixed set is what makes dedupe keys stable and what lets an on-call
// runbook be written against something. A typo in a free-form string would
// silently create a new alert identity and defeat suppression.
const ALERT = {
  MONGO_UNAVAILABLE: "mongo_unavailable",
  MONGO_DEGRADED: "mongo_degraded",
  PAYMENT_WEBHOOK_FAILURE: "payment_webhook_failure",
  PAYMENT_VERIFICATION_ANOMALY: "payment_verification_anomaly",
  PAYMENT_AMOUNT_MISMATCH: "payment_amount_mismatch",
  PAYMENT_REPEATED_FAILURES: "payment_repeated_failures",
  PAYMENT_ORDER_NOT_FOUND: "payment_order_not_found",
  CLOUDINARY_FAILURE: "cloudinary_failure",
  DOCUMENT_CLEANUP_FAILING: "document_cleanup_failing",
  AUTH_SYSTEM_FAILURE: "auth_system_failure",
  EMAIL_PROVIDER_UNAVAILABLE: "email_provider_unavailable",
  REDIS_UNAVAILABLE: "redis_unavailable",
  SERVER_ERROR_RATE: "server_error_rate",
  UNCAUGHT_EXCEPTION: "uncaught_exception",
  PUSH_PROVIDER_FAILURE: "push_provider_failure",
};

// Severity ordering, for the ALERT_MIN_SEVERITY threshold. Lower index is
// more severe, so "send if index <= threshold index".
const severityRank = (severity) => {
  const index = SEVERITIES.indexOf(severity);
  return index === -1 ? SEVERITIES.length : index;
};

// Per-process dedupe fallback. Bounded, so a long-running process with many
// distinct alert keys cannot grow it without limit.
const localSuppression = new Map();
const LOCAL_SUPPRESSION_MAX = 500;

function localClaim(key, windowMs) {
  const now = Date.now();
  // Opportunistic sweep of expired entries, so the map tracks live
  // suppressions rather than everything ever alerted.
  if (localSuppression.size > LOCAL_SUPPRESSION_MAX) {
    for (const [existing, expiry] of localSuppression) {
      if (expiry <= now) localSuppression.delete(existing);
    }
    if (localSuppression.size > LOCAL_SUPPRESSION_MAX) localSuppression.clear();
  }
  const until = localSuppression.get(key);
  if (until && until > now) return false;
  localSuppression.set(key, now + windowMs);
  return true;
}

// True if this alert should be delivered now, false if an identical one was
// delivered inside the window.
async function claimAlert(key, windowMs) {
  if (windowMs <= 0) return true;

  if (isRedisEnabled()) {
    // SET key NX PX window - one instance wins, the rest are suppressed.
    // On a Redis failure this returns null, and the local map decides
    // instead: an alerting control must fail towards delivering.
    const claimed = await redisSetIfAbsent("alert:" + key, "1", windowMs);
    if (claimed !== null) return claimed;
  }

  return localClaim(key, windowMs);
}

// ---------------------------------------------------------------------------
// Teams card construction
// ---------------------------------------------------------------------------
//
// Adaptive Card wrapped in a `message` attachment, which is what a Power
// Automate "When a Teams webhook request is received" workflow expects.
//
// This is the current shape on purpose. Microsoft has retired Office 365
// Connectors (the old MessageCard / "@type: MessageCard" format), and new
// Teams webhooks are created as Workflows, which accept Adaptive Cards. The
// legacy format is still available behind TEAMS_WEBHOOK_FORMAT=legacy for a
// deployment whose connector has not yet been migrated, because defaulting
// to the retired format would mean every card silently fails to post.
const SEVERITY_COLOUR = {
  P0: "attention",
  P1: "warning",
  P2: "accent",
  P3: "good",
};

// Both builders scrub their own inputs, even though alert() has already
// scrubbed everything it passes in.
//
// That is deliberate duplication. These two functions are the last thing
// that runs before a payload leaves the process, so making them safe on
// their own means a future caller that builds a card directly - or an
// alert() that grows a path which forgets to scrub - still cannot post a
// password or a document URL into a chat channel. The cost is one extra
// pass over a handful of fields; the thing it prevents is permanent.
function buildAdaptiveCard({ severity, title, summary, facts, identity }) {
  facts = scrub(facts) || {};
  title = scrubString(String(title || ""));
  summary = scrubString(String(summary || ""));

  const factSet = Object.entries(facts)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({ title: key, value: String(value) }));

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: severity + " - " + title,
              weight: "bolder",
              size: "medium",
              color: SEVERITY_COLOUR[severity] || "default",
              wrap: true,
            },
            { type: "TextBlock", text: summary, wrap: true },
            {
              type: "FactSet",
              facts: [
                { title: "Service", value: identity.service },
                { title: "Environment", value: identity.environment },
                { title: "Release", value: identity.release },
                ...factSet,
              ],
            },
          ],
        },
      },
    ],
  };
}

function buildLegacyCard({ severity, title, summary, facts, identity }) {
  facts = scrub(facts) || {};
  title = scrubString(String(title || ""));
  summary = scrubString(String(summary || ""));

  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: severity + " - " + title,
    themeColor: severity === "P0" ? "D13438" : severity === "P1" ? "F7A700" : "0E6CB0",
    title: severity + " - " + title,
    text: summary,
    sections: [
      {
        facts: [
          { name: "Service", value: identity.service },
          { name: "Environment", value: identity.environment },
          { name: "Release", value: identity.release },
          ...Object.entries(facts)
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => ({ name: key, value: String(value) })),
        ],
      },
    ],
  };
}

// POSTs the card. Never throws, always times out.
//
// The timeout is the important part: an alert is sent from inside a failing
// request path, and a Teams endpoint that accepts the connection but never
// responds would otherwise hold that request open. A missed alert is better
// than a hung server.
async function postToTeams(config, card) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The URL is never included - it is the credential. Status only.
      console.error("[alerts] Teams rejected the card: HTTP " + response.status);
      return false;
    }
    return true;
  } catch (error) {
    const reason = error.name === "AbortError" ? "timed out" : scrubString(error.message || "unknown");
    console.error("[alerts] Teams delivery failed (" + reason + ")");
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------
//
// alert({ severity, reason, title, summary, facts, error, dedupeKey })
//
//   severity   "P0".."P3". Decides who finds out and how loudly.
//   reason     one of ALERT above. Forms the dedupe identity.
//   title      short, human, shown as the card heading.
//   summary    one or two sentences: what broke and what it means.
//   facts      ids and counts. Scrubbed. Never records, never URLs.
//   error      the underlying Error, if there is one. Goes to Sentry.
//   dedupeKey  extra discriminator appended to `reason`, e.g. an order id,
//              when per-subject suppression is wanted instead of per-reason.
//
// Returns { severity, teams, sentry, suppressed }. Never throws - this is
// called from inside catch blocks, and an alerting failure must not become
// the error that takes a request down.
async function alert({
  severity = "P1",
  reason,
  title,
  summary = "",
  facts = {},
  error = null,
  dedupeKey = null,
}) {
  const result = { severity, teams: false, sentry: false, suppressed: false };

  try {
    if (!SEVERITIES.includes(severity)) severity = "P1";

    const config = observabilityConfig();
    const safeFacts = scrub(facts) || {};
    const key = dedupeKey ? reason + ":" + dedupeKey : reason;

    // ---- always: a local log line ----
    //
    // Written before any delivery is attempted, so the evidence exists even
    // if every outbound channel is down. This is the only record that cannot
    // itself fail.
    console.error(
      "[alert] " +
        JSON.stringify({
          severity,
          reason,
          title,
          summary: scrubString(summary),
          ...safeFacts,
          timestamp: new Date().toISOString(),
        })
    );

    // ---- Sentry: P0, P1, P2 ----
    if (severityRank(severity) <= severityRank("P2")) {
      const context = {
        level: severity === "P0" ? "fatal" : severity === "P1" ? "error" : "warning",
        tags: { alert_reason: reason, severity },
        ...safeFacts,
      };
      const eventId = error
        ? captureError(error, context)
        : captureMessage(title + ": " + summary, context);
      result.sentry = Boolean(eventId);
      if (eventId) result.sentryEventId = eventId;
    }

    // ---- Teams: only at or above the configured threshold ----
    if (!config.teams.enabled) return result;
    if (severityRank(severity) > severityRank(config.teams.minSeverity)) return result;

    const claimed = await claimAlert(key, config.teams.dedupeWindowMs);
    if (!claimed) {
      result.suppressed = true;
      return result;
    }

    const payload = { severity, title, summary: scrubString(summary), facts: safeFacts, identity: config.identity };
    const card =
      (process.env.TEAMS_WEBHOOK_FORMAT || "").trim().toLowerCase() === "legacy"
        ? buildLegacyCard(payload)
        : buildAdaptiveCard(payload);

    result.teams = await postToTeams(config.teams, card);
    return result;
  } catch (alertError) {
    console.error("[alerts] alerting itself failed: " + scrubString(alertError.message || "unknown"));
    return result;
  }
}

// Convenience wrappers, so a call site states severity by choosing a
// function rather than by passing a string that could be mistyped.
const alertP0 = (options) => alert({ ...options, severity: "P0" });
const alertP1 = (options) => alert({ ...options, severity: "P1" });
const alertP2 = (options) => alert({ ...options, severity: "P2" });
const alertP3 = (options) => alert({ ...options, severity: "P3" });

// ---------------------------------------------------------------------------
// Error-rate tracking
// ---------------------------------------------------------------------------
//
// "Unusually high 5xx rate" cannot be judged from a single error, so the
// global error handler feeds every 5xx through here and this decides when the
// shape of the traffic - not one request - warrants an alert.
//
// A plain sliding count rather than a percentage: a percentage needs a
// denominator of all requests, and tracking every request to catch a rare
// event costs more than it is worth. A burst of 5xx in a short window is a
// sufficient signal, and the threshold is configurable for deployments whose
// normal volume differs.
const errorWindow = [];

function recordServerError({ windowMs = 60000, threshold = 10 } = {}) {
  const now = Date.now();
  errorWindow.push(now);
  while (errorWindow.length > 0 && errorWindow[0] < now - windowMs) errorWindow.shift();

  // Hard cap, so a sustained flood cannot grow the array without bound.
  if (errorWindow.length > 1000) errorWindow.splice(0, errorWindow.length - 1000);

  return { count: errorWindow.length, exceeded: errorWindow.length >= threshold, windowMs };
}

function resetErrorWindow() {
  errorWindow.length = 0;
}

module.exports = {
  alert,
  alertP0,
  alertP1,
  alertP2,
  alertP3,
  ALERT,
  recordServerError,
  resetErrorWindow,
  buildAdaptiveCard,
  buildLegacyCard,
  severityRank,
  // Exported for the test suite, which drives suppression directly.
  claimAlert,
};
