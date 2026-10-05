const cloudinary = require("../config/cloudinary");
const Upload = require("../models/Upload");
const { captureError } = require("./sentry");
const { alertP1, ALERT } = require("./alerts");

// Deleting customer documents - the Cloudinary asset and the Upload record
// that points at it.
//
// A customer's print file must not outlive the order it was printed for.
// There are three ways a document becomes due for deletion:
//
//   1. its order completed            -> deleteOrderDocuments (orderController)
//   2. its order expired unpaid/stale -> deleteOrderDocuments (cron/cleanupAbandonedOrders)
//   3. it was never ordered at all    -> cleanupOrphanedUploads (cron/cleanupDocuments)
//
// and one way a deletion that was due can fail: Cloudinary being briefly
// unavailable. That used to be the end of it - the error was logged, the
// Upload record was kept "for a manual retry", and nothing ever retried.
// retryFailedDocumentCleanups is that retry, and it is why the Upload
// schema carries cleanup state at all.
//
// Nothing in here reads, copies or logs the contents of a document. Only
// the identifiers needed to delete it.

// Every document is uploaded with resource_type "raw" (see
// uploadController.js) because a PDF is not an image. Deleting it has to
// name the same type, or Cloudinary looks in the image namespace and
// reports "not found" for an asset that is still very much stored.
const RESOURCE_TYPE = "raw";

// Backoff between attempts, in minutes, indexed by attempt number. After
// the last entry the interval stays there.
//
// Deliberately unbounded in COUNT while bounded in FREQUENCY: giving up
// after N attempts would mean deciding to keep a customer's document
// forever, which is the outcome this whole file exists to prevent. A
// record that keeps failing keeps being retried every 6 hours and is
// logged loudly (see LOUD_AFTER_ATTEMPTS) so it gets human attention,
// rather than being silently abandoned.
const BACKOFF_MINUTES = [1, 5, 15, 60];
const MAX_BACKOFF_MINUTES = 360;
const LOUD_AFTER_ATTEMPTS = 5;

// A "deleting" claim older than this is treated as abandoned - the
// process holding it died (restart, crash, deploy) part-way through.
// Comfortably longer than any single Cloudinary call could take, so a
// slow-but-alive attempt is never stolen from underneath itself.
const STALE_CLAIM_MINUTES = 10;

// How long a never-ordered upload is kept before deletion. A customer who
// picks a file and then closes the app has left a document on our storage
// that they never asked us to keep; the window exists only so that
// someone who uploads, backgrounds the app and comes back to finish
// checkout doesn't lose their file mid-flow.
//
// From the environment so it can be tightened without a code change -
// see .env.example. Falls back to 24 hours.
function orphanRetentionHours() {
  const raw = Number(process.env.UPLOAD_ORPHAN_RETENTION_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

// Cloudinary's SDK rejects with at least three different shapes depending
// on what went wrong, and the original code read `error.message` off all
// of them - which produced the log line "Cloudinary delete failed -
// undefined" for the one shape that nests it, telling us nothing about a
// customer document that had just failed to be deleted.
//
// Observed shapes:
//   - a real Error                                (programming/network)
//   - { message, name, http_code }                (API error, e.g. 401)
//   - { error: { message, http_code, name } }     (timeouts and some
//                                                  transport failures)
//   - a bare string
//
// Returns a message that is always a non-empty string, so the log and the
// stored cleanup_last_error can never be "undefined" again.
function describeCloudinaryError(error) {
  const httpCode = error?.http_code ?? error?.error?.http_code ?? null;

  let message;
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error && error.message) {
    message = error.message;
  } else {
    message = error?.message || error?.error?.message || error?.error?.name || error?.name;
  }

  if (!message) {
    // Last resort: show the shape rather than the word "undefined", so an
    // unanticipated fourth shape is still diagnosable. Bounded, because
    // this ends up in a database field.
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
    // JSON.stringify(undefined) is itself undefined, and String(undefined)
    // is the literal "undefined" - which is the exact log line this
    // function exists to eliminate. Name the condition instead.
    if (!message || message === "undefined") {
      message = `Cloudinary rejected with no error detail (${typeof error})`;
    }
  }

  return { message: String(message).slice(0, 300), httpCode };
}

function nextAttemptDelayMinutes(attempts) {
  const index = Math.max(0, attempts - 1);
  return index < BACKOFF_MINUTES.length ? BACKOFF_MINUTES[index] : MAX_BACKOFF_MINUTES;
}

// Claims one upload for deletion, atomically.
//
// The filter is the lock: it matches only a record that is not already
// claimed, or whose claim has gone stale. Two cron passes (or a cron pass
// and an order completing) racing on the same upload means exactly one
// findOneAndUpdate matches, and the loser gets null - so Cloudinary is
// never asked to destroy the same asset twice at once, and
// cleanup_attempts cannot be double-counted.
async function claimForDeletion(uploadId) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000);

  return Upload.findOneAndUpdate(
    {
      _id: uploadId,
      $or: [
        { cleanup_status: { $ne: "deleting" } },
        { cleanup_last_attempt_at: { $lt: staleBefore } },
        { cleanup_last_attempt_at: null },
      ],
    },
    {
      $set: { cleanup_status: "deleting", cleanup_last_attempt_at: now },
      $inc: { cleanup_attempts: 1 },
    },
    { new: true }
  );
}

// Deletes one upload: the Cloudinary asset first, then the record.
//
// Returns one of "deleted" | "gone" | "busy" | "failed".
//   "deleted" - the asset was destroyed and the record removed
//   "gone"    - there was nothing to do (record already removed)
//   "busy"    - another worker holds the claim
//   "failed"  - Cloudinary refused; the record is kept and rescheduled
//
// Idempotent in both directions: a record that no longer exists is a
// success, and Cloudinary answering "not found" for an asset that was
// already destroyed is a success too. Neither is an error worth retrying
// forever.
//
// `context` only labels the log line (an order id, or "orphan").
async function deleteUploadDocument(uploadId, context = "") {
  const claimed = await claimForDeletion(uploadId);

  if (!claimed) {
    // Either the record is gone (already cleaned up) or someone else is
    // mid-attempt. Distinguish them, because one is done and the other
    // will finish on its own.
    const stillThere = await Upload.exists({ _id: uploadId });
    return stillThere ? "busy" : "gone";
  }

  const label = `[documentCleanup]${context ? ` ${context},` : ""} upload ${uploadId}`;

  try {
    const result = await cloudinary.uploader.destroy(claimed.public_id, {
      resource_type: RESOURCE_TYPE,
    });

    // "not found" means the asset is not there - which is the state we are
    // trying to reach. Treating it as a failure would retry forever
    // against something that can never succeed any harder than this.
    if (result?.result !== "ok" && result?.result !== "not found") {
      throw { message: `unexpected Cloudinary result "${result?.result}"`, http_code: null };
    }
  } catch (error) {
    const { message, httpCode } = describeCloudinaryError(error);
    const attempts = claimed.cleanup_attempts;
    const delay = nextAttemptDelayMinutes(attempts);
    const nextAt = new Date(Date.now() + delay * 60 * 1000);

    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          cleanup_status: "failed",
          cleanup_next_attempt_at: nextAt,
          cleanup_last_error: message,
        },
      }
    );

    // Structured, and never containing anything from inside the document.
    const diagnostic = {
      uploadId: String(uploadId),
      cloudinaryPublicId: claimed.public_id,
      attempt: attempts,
      errorMessage: message,
      httpCode,
      retryInMinutes: delay,
      timestamp: new Date().toISOString(),
    };
    if (attempts >= LOUD_AFTER_ATTEMPTS) {
      console.error(
        `${label}: STILL FAILING after ${attempts} attempts - a customer document is being retained. ${JSON.stringify(diagnostic)}`
      );
      // Escalated to an alert, not merely reported, once the retries have
      // stopped being plausibly transient. This is a privacy commitment
      // failing, not a performance problem: a customer's document is still in
      // Cloudinary after the point at which the privacy policy says it would
      // be gone. The /privacy page states that deletion is scheduled and
      // automated, and this is the condition in which that stops being true.
      alertP1({
        reason: ALERT.DOCUMENT_CLEANUP_FAILING,
        title: "A customer document cannot be deleted",
        summary:
          `Deletion of an uploaded document has failed ${attempts} times and the file is still in ` +
          "Cloudinary. Printlly's privacy policy commits to deleting documents after an order ends, so " +
          "this is a retention commitment being missed. Check Cloudinary's status and that the API " +
          "credentials have not been rotated.",
        facts: {
          upload_id: String(uploadId),
          attempts,
          http_code: httpCode,
          // The Cloudinary error text only. The public_id is deliberately
          // omitted - it is enough to construct a delivery URL for the
          // document, and utils/scrub.js redacts it anyway.
          cloudinary_error: message,
        },
        dedupeKey: String(uploadId),
      });
    } else {
      console.error(`${label}: Cloudinary delete failed, will retry. ${JSON.stringify(diagnostic)}`);
      // The first few failures go to Sentry only. Cloudinary has brief
      // outages, the backoff exists precisely to ride them out, and paging
      // someone for a failure that will resolve itself in a minute is how an
      // alert channel gets muted.
      captureError(error instanceof Error ? error : new Error(message), {
        level: "warning",
        tags: { feature: "document_cleanup", provider: "cloudinary" },
        upload_id: String(uploadId),
        attempt: attempts,
        http_code: httpCode,
      });
    }
    return "failed";
  }

  try {
    await Upload.deleteOne({ _id: uploadId });
    return "deleted";
  } catch (error) {
    // The asset is gone but the record is not. Reschedule: the next
    // attempt's destroy will answer "not found" and the delete will be
    // retried, so this converges.
    const { message } = describeCloudinaryError(error);
    await Upload.updateOne(
      { _id: uploadId },
      {
        $set: {
          cleanup_status: "failed",
          cleanup_next_attempt_at: new Date(Date.now() + nextAttemptDelayMinutes(claimed.cleanup_attempts) * 60 * 1000),
          cleanup_last_error: `record delete failed: ${message}`,
        },
      }
    );
    console.error(`${label}: Cloudinary asset deleted but Upload record remains - ${message}`);
    return "failed";
  }
}

// Deletes every document belonging to one order. Called when an order
// completes and when one expires.
//
// Never throws: completing an order must not fail because Cloudinary is
// briefly down. A document that cannot be deleted right now is left
// marked "failed" with a retry scheduled, so the order still completes
// and the deletion still happens - just later.
async function deleteOrderDocuments(order) {
  const deleted = [];
  const failed = [];

  for (const doc of order.documents || []) {
    let outcome;
    try {
      outcome = await deleteUploadDocument(doc.upload_id, `order ${order._id}`);
    } catch (error) {
      // Only reachable if the claim query itself threw (database down).
      // Nothing is lost: the record keeps whatever state it had, and the
      // retry pass will pick it up once it has a due date - which it gets
      // here.
      const { message } = describeCloudinaryError(error);
      failed.push(String(doc.upload_id));
      await Upload.updateOne(
        { _id: doc.upload_id },
        {
          $set: {
            cleanup_status: "failed",
            cleanup_next_attempt_at: new Date(Date.now() + BACKOFF_MINUTES[0] * 60 * 1000),
            cleanup_last_error: `claim failed: ${message}`,
          },
        }
      ).catch(() => {});
      console.error(`[documentCleanup] order ${order._id}, upload ${doc.upload_id}: claim failed - ${message}`);
      continue;
    }

    if (outcome === "deleted" || outcome === "gone") {
      deleted.push(String(doc.upload_id));
    } else {
      // "busy" counts as not-yet-done rather than failed, but either way
      // it is not this call's to finish.
      failed.push(String(doc.upload_id));
    }
  }

  if (failed.length > 0) {
    console.error(
      `[documentCleanup] order ${order._id}: ${failed.length} document(s) not deleted yet - scheduled for retry: ${failed.join(", ")}`
    );
  }

  return { deleted, failed };
}

// The retry pass. Finds records whose last attempt failed and whose
// backoff has elapsed, and tries again.
//
// Also picks up "pending" records (queued by the orphan sweep) and claims
// that went stale because the process holding them died - which is what
// makes this safe across a restart: state lives in MongoDB, not in
// memory, so a server that dies mid-delete simply has its claim expire
// and reclaimed on a later run.
async function retryFailedDocumentCleanups({ limit = 50 } = {}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60 * 1000);

  const due = await Upload.find({
    $or: [
      { cleanup_status: "failed", cleanup_next_attempt_at: { $lte: now } },
      { cleanup_status: "pending" },
      { cleanup_status: "deleting", cleanup_last_attempt_at: { $lt: staleBefore } },
    ],
  })
    .select("_id")
    .sort({ cleanup_next_attempt_at: 1 })
    .limit(limit)
    .lean();

  const summary = { attempted: due.length, deleted: 0, failed: 0, busy: 0, gone: 0 };

  for (const row of due) {
    const outcome = await deleteUploadDocument(row._id, "retry");
    if (outcome === "deleted") summary.deleted += 1;
    else if (outcome === "gone") summary.gone += 1;
    else if (outcome === "busy") summary.busy += 1;
    else summary.failed += 1;
  }

  return summary;
}

// Reports which never-ordered uploads are old enough to delete, without
// deleting anything. Used by the cleanup pass below and by
// scripts/cleanupOrphanUploads.js so an operator can see what is about to
// happen before it happens.
async function findOrphanedUploads({ retentionHours = orphanRetentionHours(), uploadIds = null } = {}) {
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  // used: false is the whole safety condition. It is set to true the
  // moment an upload is attached to an order (orderController.js), so
  // anything still false has never belonged to an order - there is no
  // live order this could be pulled out from under.
  //
  // uploadIds narrows the sweep to a specific reviewed set. Two callers
  // need it: scripts/cleanupOrphanUploads.js, so an operator can report
  // what is eligible and then delete exactly that set rather than
  // whatever has become eligible in the meantime; and the test suite,
  // which must never touch an upload it did not create itself. It only
  // ever NARROWS - the used/age conditions still apply to every id.
  const filter = { used: false, createdAt: { $lt: cutoff } };
  if (uploadIds) filter._id = { $in: uploadIds };

  const rows = await Upload.find(filter)
    .select("_id public_id createdAt cleanup_status cleanup_attempts")
    .sort({ createdAt: 1 })
    .lean();

  return { cutoff, retentionHours, uploads: rows };
}

// Deletes never-ordered uploads older than the retention window.
//
// An upload younger than the cutoff is never touched: a customer who is
// mid-checkout has a document sitting here with used still false, and
// deleting it would break the order they are in the middle of placing.
async function cleanupOrphanedUploads({ retentionHours, uploadIds } = {}) {
  const { uploads, cutoff } = await findOrphanedUploads({
    ...(retentionHours ? { retentionHours } : {}),
    ...(uploadIds ? { uploadIds } : {}),
  });

  const summary = { eligible: uploads.length, deleted: 0, failed: 0, busy: 0, gone: 0, cutoff };
  if (uploads.length === 0) return summary;

  for (const row of uploads) {
    const outcome = await deleteUploadDocument(row._id, "orphan");
    if (outcome === "deleted") summary.deleted += 1;
    else if (outcome === "gone") summary.gone += 1;
    else if (outcome === "busy") summary.busy += 1;
    else summary.failed += 1;
  }

  console.log(
    `[documentCleanup] orphan sweep: ${summary.eligible} eligible, ${summary.deleted} deleted, ${summary.failed} failed, ${summary.busy} busy`
  );
  return summary;
}

module.exports = {
  deleteOrderDocuments,
  deleteUploadDocument,
  retryFailedDocumentCleanups,
  cleanupOrphanedUploads,
  findOrphanedUploads,
  describeCloudinaryError,
  orphanRetentionHours,
  // Exported for the tests, which assert the backoff schedule directly
  // rather than waiting out real minutes.
  nextAttemptDelayMinutes,
  BACKOFF_MINUTES,
  MAX_BACKOFF_MINUTES,
  STALE_CLAIM_MINUTES,
};
