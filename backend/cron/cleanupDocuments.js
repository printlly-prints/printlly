const cron = require("node-cron");
const {
  retryFailedDocumentCleanups,
  cleanupOrphanedUploads,
  orphanRetentionHours,
} = require("../utils/documentCleanup");
const { alertP1, ALERT } = require("../utils/alerts");

// Two document-privacy passes, on their own schedule:
//
//   1. retry  - documents whose deletion failed (Cloudinary briefly down
//               when their order completed) and whose backoff has elapsed.
//   2. orphan - documents that were uploaded but never ordered, older than
//               UPLOAD_ORPHAN_RETENTION_HOURS.
//
// Separate from cron/cleanupAbandonedOrders.js on purpose, rather than
// bolted onto it. That job runs every 15 minutes because it is looking for
// orders stuck for 48 hours or unpaid for 1 hour - a 15-minute resolution
// is ample. The retry backoff here starts at 1 minute, which a 15-minute
// schedule simply cannot honour: the first retry would always be at least
// 15 minutes late. Two concerns, two intervals.
//
// All state lives in MongoDB (see models/Upload.js), so this is safe
// across restarts: a process killed mid-delete leaves a "deleting" claim
// that the next run recognises as stale and reclaims.
const RETRY_SCHEDULE = "*/2 * * * *"; // every 2 minutes
const ORPHAN_SCHEDULE = "17 * * * *"; // hourly, at :17

// A pass in which several documents were due and NONE could be deleted.
//
// Distinct from the per-document alert in utils/documentCleanup.js, and the
// distinction is the point: that one fires when one file is stuck, which can
// be a single corrupt record. This fires when the whole mechanism is
// failing - Cloudinary unreachable, or credentials rotated out from under the
// deployment - which means documents are accumulating across every order and
// no customer's files are being deleted at all.
//
// Three, because one or two failures are routine and ride out on the backoff.
const SYSTEMIC_FAILURE_THRESHOLD = 3;

async function runRetryPass() {
  const summary = await retryFailedDocumentCleanups();
  // Silent when there is nothing to do - this runs 720 times a day and
  // should not fill the log with "attempted 0".
  if (summary.attempted > 0) {
    console.log(
      `[cleanupDocuments] retry pass: attempted ${summary.attempted}, deleted ${summary.deleted}, still failing ${summary.failed}, busy ${summary.busy}, already gone ${summary.gone}`
    );
  }

  // "busy" and "gone" are excluded from the judgement: busy means another
  // instance holds the claim, and gone means the record had already been
  // cleaned up. Neither is a failure, and counting them would make a healthy
  // multi-instance deployment look broken.
  if (summary.failed >= SYSTEMIC_FAILURE_THRESHOLD && summary.deleted === 0) {
    await alertP1({
      reason: ALERT.DOCUMENT_CLEANUP_FAILING,
      title: "Document cleanup is failing entirely",
      summary:
        `${summary.failed} document deletions were due and none succeeded. Customer documents are ` +
        "accumulating in Cloudinary past the point at which Printlly's privacy policy says they are " +
        "deleted. Orders are unaffected. Check Cloudinary status and the CLOUDINARY_* credentials.",
      facts: {
        attempted: summary.attempted,
        failed: summary.failed,
        deleted: summary.deleted,
      },
    });
  }

  return summary;
}

async function runOrphanPass() {
  return cleanupOrphanedUploads();
}

function startDocumentCleanup() {
  cron.schedule(
    RETRY_SCHEDULE,
    () => {
      runRetryPass().catch((error) => {
        console.error(`[cleanupDocuments] retry pass failed: ${error.message}`);
      });
    },
    { name: "cleanup-documents-retry", noOverlap: true }
  );

  cron.schedule(
    ORPHAN_SCHEDULE,
    () => {
      runOrphanPass().catch((error) => {
        console.error(`[cleanupDocuments] orphan pass failed: ${error.message}`);
      });
    },
    { name: "cleanup-documents-orphans", noOverlap: true }
  );

  console.log(
    `[cleanupDocuments] scheduled: retry every 2 minutes, orphan sweep hourly (retention ${orphanRetentionHours()}h)`
  );
}

module.exports = { startDocumentCleanup, runRetryPass, runOrphanPass };
