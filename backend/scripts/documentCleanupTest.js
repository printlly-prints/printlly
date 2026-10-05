// Tests the document-deletion lifecycle: success, failure, retry, backoff,
// idempotency, concurrency and the orphan sweep.
//
// Runs against the REAL database and the REAL Cloudinary account, because
// the bug being fixed was specifically about how the Cloudinary SDK
// behaves - a mocked client would have passed the whole time.
//
// Every asset it touches is one it uploaded itself, under the
// cleanup-test/ prefix, and it deletes everything it created on the way
// out. It never looks at, or touches, uploads belonging to real orders.
//
// Failures are injected by replacing cloudinary.uploader.destroy on the
// shared module instance (Node caches modules, so utils/documentCleanup.js
// sees the replacement) and restoring it afterwards.
//
// Run with: node scripts/documentCleanupTest.js
require("dotenv").config();
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const Upload = require("../models/Upload");
const {
  deleteOrderDocuments,
  deleteUploadDocument,
  retryFailedDocumentCleanups,
  cleanupOrphanedUploads,
  findOrphanedUploads,
  describeCloudinaryError,
  nextAttemptDelayMinutes,
  BACKOFF_MINUTES,
  MAX_BACKOFF_MINUTES,
  STALE_CLAIM_MINUTES,
} = require("../utils/documentCleanup");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};

const STAMP = Date.now();
const createdUploadIds = [];
const createdPublicIds = [];

// A minimal structurally-valid single-page PDF. Same approach the e2e
// suite uses - small enough to upload instantly, real enough to store.
function dummyPdf() {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF\n",
    "utf8"
  );
}

// Uploads a real asset and creates the Upload record that points at it,
// exactly as POST /upload does.
async function makeTestUpload({ used = false, createdAt = null, ownerId } = {}) {
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "raw", folder: `cleanup-test/${STAMP}` },
      (error, uploaded) => (error ? reject(error) : resolve(uploaded))
    );
    stream.end(dummyPdf());
  });
  createdPublicIds.push(result.public_id);

  const upload = await Upload.create({
    uploader_id: ownerId || new mongoose.Types.ObjectId(),
    file_url: result.secure_url,
    public_id: result.public_id,
    original_name: `cleanup-test-${STAMP}.pdf`,
    size: dummyPdf().length,
    page_count: 1,
    used,
  });
  createdUploadIds.push(upload._id);

  // Back-dating has to bypass Mongoose's timestamp handling, which would
  // overwrite createdAt on save.
  if (createdAt) {
    await Upload.collection.updateOne({ _id: upload._id }, { $set: { createdAt } });
  }
  return upload;
}

async function assetExists(publicId) {
  try {
    await cloudinary.api.resource(publicId, { resource_type: "raw" });
    return true;
  } catch {
    return false;
  }
}

// Replaces destroy for the duration of fn, then restores it.
async function withBrokenCloudinary(rejectionValue, fn) {
  const original = cloudinary.uploader.destroy;
  let callCount = 0;
  cloudinary.uploader.destroy = async () => {
    callCount += 1;
    throw rejectionValue;
  };
  try {
    return await fn(() => callCount);
  } finally {
    cloudinary.uploader.destroy = original;
  }
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Document cleanup tests, run ${STAMP}\n`);

  try {
    // =============================================== error extraction
    console.log("--- Cloudinary error extraction (the root cause) ---");
    // The exact shape that produced "Cloudinary delete failed - undefined":
    // a nested error object whose message is not on the top level.
    const nested = describeCloudinaryError({ error: { message: "Request Timeout", http_code: 499 } });
    check(nested.message === "Request Timeout", "a nested { error: { message } } is read, not reported as undefined", nested.message);
    check(nested.httpCode === 499, "and its http_code comes through", String(nested.httpCode));

    const api = describeCloudinaryError({ message: "Invalid Signature", name: "Error", http_code: 401 });
    check(api.message === "Invalid Signature", "a flat API error is read", api.message);
    check(api.httpCode === 401, "with its status", String(api.httpCode));

    check(describeCloudinaryError(new Error("socket hang up")).message === "socket hang up", "a real Error is read");
    check(describeCloudinaryError("plain string failure").message === "plain string failure", "a bare string is read");
    const weird = describeCloudinaryError({ unexpected: true });
    check(weird.message && weird.message !== "undefined", "an unanticipated shape still yields something diagnosable", weird.message);
    // No "|| true" escape hatch: a bare undefined rejection is the exact
    // case that produced the original log line, so this has to be a real
    // assertion.
    const bare = describeCloudinaryError(undefined);
    check(
      bare.message !== "undefined" && bare.message.length > 0,
      'a rejection with no detail at all never logs the bare word "undefined"',
      bare.message
    );
    const nullish = describeCloudinaryError(null);
    check(nullish.message !== "undefined" && nullish.message.length > 0, "nor does null", nullish.message);

    // =============================================== backoff schedule
    console.log("\n--- backoff schedule (TEST 4, the arithmetic half) ---");
    check(nextAttemptDelayMinutes(1) === 1, "attempt 1 retries after 1 minute");
    check(nextAttemptDelayMinutes(2) === 5, "attempt 2 after 5 minutes");
    check(nextAttemptDelayMinutes(3) === 15, "attempt 3 after 15 minutes");
    check(nextAttemptDelayMinutes(4) === 60, "attempt 4 after 1 hour");
    check(nextAttemptDelayMinutes(5) === MAX_BACKOFF_MINUTES, `attempt 5 onwards caps at ${MAX_BACKOFF_MINUTES} minutes`);
    check(nextAttemptDelayMinutes(99) === MAX_BACKOFF_MINUTES, "and stays capped - never a tight loop");
    check(BACKOFF_MINUTES.every((m) => m >= 1), "no interval is under a minute");

    // =============================================== TEST 1
    console.log("\n--- TEST 1: order completes -> asset and record both gone ---");
    const u1 = await makeTestUpload({ used: true });
    check(await assetExists(u1.public_id), "the test asset is really on Cloudinary to begin with");
    const fakeOrder = { _id: new mongoose.Types.ObjectId(), documents: [{ upload_id: u1._id }] };
    const r1 = await deleteOrderDocuments(fakeOrder);
    check(r1.deleted.length === 1 && r1.failed.length === 0, "cleanup reports one deleted, none failed", JSON.stringify(r1));
    check(!(await assetExists(u1.public_id)), "the Cloudinary asset is gone");
    check(!(await Upload.exists({ _id: u1._id })), "and the Upload record is gone");

    // =============================================== TEST 2
    console.log("\n--- TEST 2: Cloudinary fails -> record kept, retry scheduled ---");
    const u2 = await makeTestUpload({ used: true });
    const order2 = { _id: new mongoose.Types.ObjectId(), documents: [{ upload_id: u2._id }] };
    const before = Date.now();
    await withBrokenCloudinary({ error: { message: "Request Timeout", http_code: 499 } }, async () => {
      const r = await deleteOrderDocuments(order2);
      check(r.failed.length === 1, "cleanup reports the failure", JSON.stringify(r));
    });
    let state = await Upload.findById(u2._id).lean();
    check(!!state, "the Upload record is KEPT - the public_id is still needed to retry");
    check(state.cleanup_status === "failed", 'cleanup_status is "failed"', state.cleanup_status);
    check(state.cleanup_attempts === 1, "one attempt recorded", String(state.cleanup_attempts));
    check(!!state.cleanup_next_attempt_at, "a retry time is set");
    const delay = (new Date(state.cleanup_next_attempt_at).getTime() - before) / 60000;
    check(delay > 0.5 && delay < 2, "roughly a minute out, per the first backoff step", `${delay.toFixed(2)} min`);
    check(state.cleanup_last_error === "Request Timeout", "and the REAL error is stored, not 'undefined'", state.cleanup_last_error);
    check(await assetExists(u2.public_id), "the asset is still there - nothing was silently lost");

    // =============================================== TEST 3
    console.log("\n--- TEST 3: the retry pass succeeds ---");
    // Make it due now rather than waiting a real minute.
    await Upload.updateOne({ _id: u2._id }, { $set: { cleanup_next_attempt_at: new Date(Date.now() - 1000) } });
    const retried = await retryFailedDocumentCleanups();
    check(retried.deleted >= 1, "the retry pass deleted it", JSON.stringify(retried));
    check(!(await assetExists(u2.public_id)), "the Cloudinary asset is now gone");
    check(!(await Upload.exists({ _id: u2._id })), "and so is the record");

    // =============================================== TEST 4
    console.log("\n--- TEST 4: repeated failures increment attempts and back off ---");
    const u4 = await makeTestUpload({ used: true });
    const observed = [];
    await withBrokenCloudinary({ error: { message: "Service Unavailable", http_code: 503 } }, async () => {
      for (let i = 0; i < 3; i += 1) {
        await deleteUploadDocument(u4._id, "test4");
        const row = await Upload.findById(u4._id).lean();
        observed.push({
          attempts: row.cleanup_attempts,
          delayMin: Math.round((new Date(row.cleanup_next_attempt_at) - Date.now()) / 60000),
        });
        // Make it immediately due again so the loop can observe the next step.
        await Upload.updateOne({ _id: u4._id }, { $set: { cleanup_next_attempt_at: new Date(Date.now() - 1000) } });
      }
    });
    check(
      observed.map((o) => o.attempts).join(",") === "1,2,3",
      "attempts increment 1, 2, 3 - never double-counted",
      observed.map((o) => o.attempts).join(",")
    );
    check(
      observed[1].delayMin > observed[0].delayMin && observed[2].delayMin > observed[1].delayMin,
      "and each retry waits longer than the last",
      observed.map((o) => `${o.delayMin}m`).join(" -> ")
    );
    const row4 = await Upload.findById(u4._id).lean();
    check(row4.cleanup_last_error === "Service Unavailable", "the latest real error is kept", row4.cleanup_last_error);

    // =============================================== TEST 5
    console.log("\n--- TEST 5: asset already deleted -> treated as success (idempotent) ---");
    // Delete the Cloudinary asset out from under the record, then clean up.
    await cloudinary.uploader.destroy(u4.public_id, { resource_type: "raw" });
    check(!(await assetExists(u4.public_id)), "asset removed behind the record's back");
    const r5 = await deleteUploadDocument(u4._id, "test5");
    check(r5 === "deleted", 'a "not found" asset is a success, not a permanent failure', r5);
    check(!(await Upload.exists({ _id: u4._id })), "and the record is cleaned up rather than retried forever");

    // ---- and a record that no longer exists must not crash -----------
    const r5b = await deleteUploadDocument(new mongoose.Types.ObjectId(), "test5b");
    check(r5b === "gone", "cleaning up an Upload that is already gone returns cleanly", r5b);
    const r5c = await deleteOrderDocuments({
      _id: new mongoose.Types.ObjectId(),
      documents: [{ upload_id: new mongoose.Types.ObjectId() }],
    });
    check(r5c.failed.length === 0, "and an order whose documents are already gone reports no failures", JSON.stringify(r5c));

    // =============================================== TEST 6 + 7
    console.log("\n--- TEST 6/7: orphan sweep respects the retention window ---");
    const hours = 24;
    const oldOrphan = await makeTestUpload({
      used: false,
      createdAt: new Date(Date.now() - (hours + 2) * 3600 * 1000),
    });
    const freshOrphan = await makeTestUpload({ used: false });
    // An upload attached to a live order must never be swept, however old.
    const oldButUsed = await makeTestUpload({
      used: true,
      createdAt: new Date(Date.now() - (hours + 48) * 3600 * 1000),
    });

    // Scoped to the three uploads this test created. An unscoped sweep
    // here would delete real customer orphans as a side effect of running
    // the test suite, which is exactly what happened the first time this
    // ran - 6 genuine orphans were swept by a test rather than by the
    // controlled operator run they were meant to go through.
    const mine = [oldOrphan._id, freshOrphan._id, oldButUsed._id];
    const preview = await findOrphanedUploads({ retentionHours: hours, uploadIds: mine });
    const eligibleIds = preview.uploads.map((u) => String(u._id));
    check(eligibleIds.includes(String(oldOrphan._id)), "an unused upload older than the window is eligible");
    check(!eligibleIds.includes(String(freshOrphan._id)), "a recent one is NOT");
    check(
      !eligibleIds.includes(String(oldButUsed._id)),
      "and an old upload that IS attached to an order is never eligible - that would break a live order"
    );

    const sweep = await cleanupOrphanedUploads({ retentionHours: hours, uploadIds: mine });
    check(sweep.eligible === 1, "the scoped sweep touches exactly the one eligible test upload", JSON.stringify(sweep));
    check(!(await assetExists(oldOrphan.public_id)), "TEST 6: the old orphan's asset is deleted");
    check(!(await Upload.exists({ _id: oldOrphan._id })), "and its record removed");
    check(await assetExists(freshOrphan.public_id), "TEST 7: the recent upload is untouched");
    check(!!(await Upload.exists({ _id: freshOrphan._id })), "and its record intact");
    check(await assetExists(oldButUsed.public_id), "the used-but-old upload is also untouched");

    // =============================================== TEST 8
    console.log("\n--- TEST 8: two workers on the same upload ---");
    const u8 = await makeTestUpload({ used: true });
    const originalDestroy = cloudinary.uploader.destroy;
    let destroyCalls = 0;
    cloudinary.uploader.destroy = async (...args) => {
      destroyCalls += 1;
      // Hold the claim open long enough for the second worker to collide.
      await new Promise((r) => setTimeout(r, 400));
      return originalDestroy.apply(cloudinary.uploader, args);
    };
    let outcomes;
    try {
      outcomes = await Promise.all([
        deleteUploadDocument(u8._id, "worker-a"),
        deleteUploadDocument(u8._id, "worker-b"),
      ]);
    } finally {
      cloudinary.uploader.destroy = originalDestroy;
    }
    check(destroyCalls === 1, "Cloudinary was asked to destroy the asset exactly ONCE", `${destroyCalls} call(s)`);
    check(
      outcomes.filter((o) => o === "deleted").length === 1,
      "exactly one worker owns the deletion",
      outcomes.join(" + ")
    );
    check(
      outcomes.includes("busy") || outcomes.includes("gone"),
      "the other backs off instead of corrupting state",
      outcomes.join(" + ")
    );
    check(!(await Upload.exists({ _id: u8._id })), "and the record ends up deleted exactly once");
    const u8Row = await Upload.findById(u8._id).lean();
    check(u8Row === null, "no duplicate or half-written record left behind");

    // ---- a stale claim is reclaimable (restart safety) ---------------
    console.log("\n--- restart safety: a claim left by a dead process ---");
    const u9 = await makeTestUpload({ used: true });
    await Upload.updateOne(
      { _id: u9._id },
      {
        $set: {
          cleanup_status: "deleting",
          cleanup_last_attempt_at: new Date(Date.now() - (STALE_CLAIM_MINUTES + 5) * 60 * 1000),
          cleanup_attempts: 1,
        },
      }
    );
    const stalePass = await retryFailedDocumentCleanups();
    check(stalePass.deleted >= 1, "a stale 'deleting' claim is reclaimed and finished", JSON.stringify(stalePass));
    check(!(await Upload.exists({ _id: u9._id })), "so a server killed mid-delete does not strand a document");

    // =============================================== TEST 9
    console.log("\n--- TEST 9: cleanup failure must not break order completion ---");
    const u10 = await makeTestUpload({ used: true });
    const order10 = { _id: new mongoose.Types.ObjectId(), status: "completed", documents: [{ upload_id: u10._id }] };
    let threw = null;
    await withBrokenCloudinary({ error: { message: "Request Timeout", http_code: 499 } }, async () => {
      try {
        await deleteOrderDocuments(order10);
      } catch (e) {
        threw = e;
      }
    });
    check(threw === null, "deleteOrderDocuments never throws while Cloudinary is down");
    check(order10.status === "completed", "and the order it was called for is left completed");
    const row10 = await Upload.findById(u10._id).lean();
    check(row10 && row10.cleanup_status === "failed", "with the document queued for retry rather than forgotten");
  } finally {
    // ---- tear down everything this run created ----------------------
    console.log("\n--- cleaning up test artefacts ---");
    let assetsRemoved = 0;
    for (const publicId of createdPublicIds) {
      try {
        const r = await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
        if (r.result === "ok") assetsRemoved += 1;
      } catch {
        console.error(`  could not remove test asset ${publicId} - remove it by hand`);
      }
    }
    const recordsRemoved = await Upload.deleteMany({ _id: { $in: createdUploadIds } });
    console.log(
      `removed ${assetsRemoved} leftover test asset(s) and ${recordsRemoved.deletedCount} test record(s)`
    );
    await mongoose.disconnect();
  }

  console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
