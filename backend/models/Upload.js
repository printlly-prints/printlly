const mongoose = require("mongoose");

// Records every file pushed to Cloudinary through POST /upload.
//
// This exists so that order creation never has to trust a URL sent by the
// client. The client only ever gets back an upload_id; the real file_url
// is looked up here on the server when the order is created.
const uploadSchema = new mongoose.Schema(
  {
    uploader_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    file_url: {
      type: String,
      required: true,
    },
    storage_provider: {type:String,enum:['cloudinary','local'],default:'cloudinary'},
    public_id: {
      type: String,
      required: true,
    },
    original_name: {
      type: String,
      default: "",
    },
    size: {
      type: Number,
      default: 0,
    },
    // Extracted server-side with pdf-parse at upload time (see
    // uploadController.js) - never trust a page count supplied by the
    // client, since pricing is computed from this number.
    page_count: {
      type: Number,
      required: true,
    },
    // Flipped to true once an order has been created from this upload,
    // so the same file cannot be attached to several orders.
    used: {
      type: Boolean,
      default: false,
    },

    // ---- cleanup state -------------------------------------------------
    // A customer's document must not outlive the order it was printed for.
    // Deleting it means deleting the Cloudinary asset AND this record, and
    // the Cloudinary half can fail (a timeout, an outage) at the exact
    // moment an order completes. These fields are what makes that failure
    // recoverable instead of permanent.
    //
    // There is deliberately NO "deleted" status and no tombstone row: when
    // cleanup succeeds this document is removed outright. Keeping a record
    // to say "the file is gone" would mean keeping original_name (which is
    // customer data - "Medical_Report.pdf") and public_id forever, which is
    // the very thing the deletion exists to prevent. The absence of the
    // row IS the deleted state.
    //
    //   "none"     - not scheduled for cleanup. Either still in use by a
    //                live order, or recent enough that orphan cleanup has
    //                not come for it yet.
    //   "pending"  - due for cleanup, not yet attempted.
    //   "deleting" - a worker has claimed it and is mid-attempt. Claimed
    //                atomically, so two concurrent cron passes can never
    //                both call Cloudinary for the same asset.
    //   "failed"   - an attempt failed; cleanup_next_attempt_at says when
    //                to try again.
    cleanup_status: {
      type: String,
      enum: ["none", "pending", "deleting", "failed"],
      default: "none",
      index: true,
    },
    cleanup_attempts: {
      type: Number,
      default: 0,
    },
    // When the current/last attempt started. Also what lets a "deleting"
    // claim be recognised as stale and retried after a server restart -
    // without it, a process killed mid-delete would leave the record
    // claimed forever and the document stored forever.
    cleanup_last_attempt_at: {
      type: Date,
      default: null,
    },
    cleanup_next_attempt_at: {
      type: Date,
      default: null,
    },
    // Diagnostic only - the Cloudinary error message and HTTP code, never
    // anything from inside the document itself.
    cleanup_last_error: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// The retry pass: "which records are due for another attempt". Compound
// because it filters on both fields together on every run.
uploadSchema.index({ cleanup_status: 1, cleanup_next_attempt_at: 1 });

// The orphan pass: "which never-ordered uploads are old enough to delete".
uploadSchema.index({ used: 1, createdAt: 1 });

module.exports = mongoose.model("Upload", uploadSchema);
