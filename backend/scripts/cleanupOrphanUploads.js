// Controlled orphan sweep: reports what is eligible, then deletes exactly
// that set.
//
// An orphan is a document a customer uploaded and never ordered - no order
// ever referenced it, so nothing in the normal lifecycle will ever delete
// it. The hourly cron (cron/cleanupDocuments.js) does this automatically;
// this script exists so an operator can see what is about to go, and so a
// backlog can be cleared deliberately rather than noticed after the fact.
//
// Safety:
//   - only uploads with used: false are ever considered. That flag is set
//     the moment an upload is attached to an order, so nothing belonging
//     to a live order can be selected.
//   - only uploads older than the retention window.
//   - the set is resolved and PRINTED first, then deleted by id, so what
//     is deleted is exactly what was reported - not whatever had become
//     eligible by the time the delete ran.
//
// Usage:
//   node scripts/cleanupOrphanUploads.js              # report only
//   node scripts/cleanupOrphanUploads.js --delete     # report, then delete
//   node scripts/cleanupOrphanUploads.js --hours=6    # override retention
require("dotenv").config();
const mongoose = require("mongoose");
const {
  findOrphanedUploads,
  cleanupOrphanedUploads,
  orphanRetentionHours,
} = require("../utils/documentCleanup");

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const hoursArg = args.find((a) => a.startsWith("--hours="));
const retentionHours = hoursArg ? Number(hoursArg.split("=")[1]) : orphanRetentionHours();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const { uploads, cutoff } = await findOrphanedUploads({ retentionHours });

  console.log("=== Orphaned upload report ===");
  console.log(`retention window: ${retentionHours}h (anything uploaded before ${cutoff.toISOString()})`);
  console.log(`eligible orphan uploads: ${uploads.length}`);

  if (uploads.length > 0) {
    const oldest = uploads[0];
    const newest = uploads[uploads.length - 1];
    console.log(`oldest eligible: ${oldest.createdAt.toISOString()}  (${oldest.public_id})`);
    console.log(`newest eligible: ${newest.createdAt.toISOString()}  (${newest.public_id})`);
    console.log("\nfull list:");
    for (const u of uploads) {
      const ageHours = Math.round((Date.now() - new Date(u.createdAt).getTime()) / 3600000);
      console.log(`  ${u.public_id}  ${ageHours}h old  cleanup_status=${u.cleanup_status}`);
    }
  }

  if (!shouldDelete) {
    console.log(`\nReport only. Re-run with --delete to remove these ${uploads.length}.`);
    await mongoose.disconnect();
    return;
  }

  if (uploads.length === 0) {
    console.log("\nNothing to delete.");
    await mongoose.disconnect();
    return;
  }

  console.log(`\nDeleting the ${uploads.length} upload(s) listed above...`);
  // By id, so this deletes the reported set and nothing that has become
  // eligible since the report was printed.
  const summary = await cleanupOrphanedUploads({
    retentionHours,
    uploadIds: uploads.map((u) => u._id),
  });

  console.log(
    `\nresult: ${summary.deleted} deleted, ${summary.failed} failed (queued for retry), ${summary.busy} busy, ${summary.gone} already gone`
  );
  if (summary.failed > 0) {
    console.log("Failed ones are marked for automatic retry - see cron/cleanupDocuments.js.");
  }

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
