const cron = require("node-cron");
const { retryFailedEmails } = require("../utils/email");
const { observabilityConfig } = require("../config/observability");
const { alertP1, ALERT } = require("../utils/alerts");

// Retries transactional emails whose first attempt hit a transient provider
// failure, and takes over sends abandoned by a process that died mid-flight.
//
// Its own file and its own schedule, following the shape of the two existing
// cron jobs rather than being bolted onto one of them. The reasoning is the
// same one cron/cleanupDocuments.js gives for not living inside
// cron/cleanupAbandonedOrders.js: the email backoff starts at one minute
// (utils/email.js), and a job that runs every 15 minutes simply cannot
// honour that - the first retry would always be fourteen minutes late.
//
// All state is in MongoDB (models/EmailDelivery.js), so this is safe across
// restarts and safe to run on several instances: each record is claimed by
// its primary key before being sent.
const RETRY_SCHEDULE = "*/3 * * * *"; // every 3 minutes

// A run of failures across DIFFERENT emails is the signal that distinguishes
// "one address bounced" from "Brevo is unreachable". One bad recipient is not
// worth anyone's attention; a provider outage means no customer is being told
// anything, which is worth a card.
const PROVIDER_DOWN_THRESHOLD = 5;

async function runEmailRetryPass() {
  const summary = await retryFailedEmails();

  // Silent when there was nothing due. This runs 480 times a day and should
  // not fill the log with "attempted 0".
  if (summary.attempted > 0) {
    console.log(
      `[retryEmails] attempted ${summary.attempted}, sent ${summary.sent}, still retrying ${summary.retrying}, failed ${summary.failed}, abandoned ${summary.abandoned}`
    );
  }

  // Everything that was due failed, and there were several. A single
  // failure is a P2 that utils/email.js already reported to Sentry; this is
  // the pattern that says the provider itself is the problem.
  if (summary.attempted >= PROVIDER_DOWN_THRESHOLD && summary.sent === 0) {
    await alertP1({
      reason: ALERT.EMAIL_PROVIDER_UNAVAILABLE,
      title: "Transactional email is not being delivered",
      summary:
        "Every queued email in this retry pass failed. Customers are not receiving order or payment " +
        "confirmations by email. Orders, payments and in-app notifications are unaffected - email is " +
        "a downstream channel - but check the Brevo dashboard for account or sender status, and that " +
        "BREVO_API_KEY has not been rotated.",
      facts: { attempted: summary.attempted, failed: summary.failed, retrying: summary.retrying },
    });
  }

  return summary;
}

function startEmailRetries() {
  // Nothing to retry if email was never configured. Not scheduling at all is
  // better than scheduling a job that queries MongoDB every three minutes
  // forever to find nothing it could act on.
  let enabled = false;
  try {
    enabled = observabilityConfig().brevo.enabled;
  } catch {
    enabled = false;
  }

  if (!enabled) {
    console.log("[retryEmails] not scheduled (Brevo email is not configured)");
    return false;
  }

  cron.schedule(
    RETRY_SCHEDULE,
    () => {
      runEmailRetryPass().catch((error) => {
        console.error(`[retryEmails] retry pass failed: ${error.message}`);
      });
    },
    { name: "retry-transactional-emails", noOverlap: true }
  );

  console.log("[retryEmails] scheduled: every 3 minutes");
  return true;
}

module.exports = { startEmailRetries, runEmailRetryPass, PROVIDER_DOWN_THRESHOLD };
