const cloudinary = require("../config/cloudinary");
const Upload = require("../models/Upload");
const { captureError } = require("../utils/sentry");
const { alertP1, ALERT } = require("../utils/alerts");
const { trackEvent, EVENTS } = require("../utils/analytics");
const { preparePrintFile } = require("../utils/printFile");
const {
  localDocumentsEnabled,
  saveLocalDocument,
  removeLocalDocument,
} = require("../utils/localDocuments");

// Validate each file independently and store a printable PDF with its real page count.
const uploadFiles = async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res
      .status(400)
      .json({ message: "No files uploaded. Use form field 'documents'." });
  }

  const succeeded = [];
  const failed = [];

  for (const file of files) {
    let pageCount, printBuffer;
    try {
      const prepared = await preparePrintFile(file);
      pageCount = prepared.pageCount;
      printBuffer = prepared.buffer;
    } catch (error) {
      failed.push({
        original_name: file.originalname,
        error: error.message,
      });
      continue;
    }

    let result;
    const local = localDocumentsEnabled();
    try {
      // resource_type is "raw" because a PDF is not an image; Cloudinary's
      // "image" pipeline would try to transform it.
      result = local
        ? await saveLocalDocument(printBuffer)
        : await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { resource_type: "raw", folder: "print_orders" },
              (error, uploaded) => (error ? reject(error) : resolve(uploaded)),
            );
            stream.end(printBuffer);
          });

      const upload = await Upload.create({
        uploader_id: req.user.id,
        file_url: result.secure_url,
        public_id: result.public_id,
        original_name: file.originalname,
        size: file.size,
        page_count: pageCount,
        storage_provider: local ? "local" : "cloudinary",
      });

      succeeded.push({
        upload_id: upload._id,
        file_url: upload.file_url,
        page_count: upload.page_count,
        original_name: upload.original_name,
      });
    } catch (error) {
      if (local && result)
        await removeLocalDocument(result.secure_url).catch(() => {});
      failed.push({
        original_name: file.originalname,
        error: "Upload to storage failed.",
      });

      // Reported, because the customer's message deliberately says nothing
      // useful and this is otherwise invisible. A storage failure means the
      // customer cannot place an order at all - it is the hard stop at the
      // very start of the funnel - and without this the only evidence is a
      // support ticket saying "it won't upload".
      //
      // The filename is NOT included. A filename is frequently the sensitive
      // part before anyone opens the file ("mri-results.pdf",
      // "divorce-petition.pdf"), so only the size and the provider's error
      // go out, and utils/scrub.js strips any Cloudinary URL out of that.
      captureError(error, {
        tags: { feature: "upload", provider: local ? "local" : "cloudinary" },
        user: req.user,
        file_bytes: file.size,
        page_count: pageCount,
      });
    }
  }

  // Nothing usable came out of this request - treat it as a failure
  // rather than a 201 with an empty succeeded array.
  const status = succeeded.length > 0 ? 201 : 400;
  res.status(status).json({ succeeded, failed });

  // Every file in the request failed to reach storage. One corrupt PDF is
  // the customer's problem; a whole request failing at the storage step,
  // repeatedly, is Cloudinary's - and the dedupe window means a genuine
  // outage produces one card rather than one per customer.
  if (!localDocumentsEnabled() && succeeded.length === 0 && failed.length > 0) {
    const storageFailures = failed.filter(
      (entry) => entry.error === "Upload to storage failed.",
    ).length;
    if (storageFailures > 0) {
      alertP1({
        reason: ALERT.CLOUDINARY_FAILURE,
        title: "Document uploads are failing",
        summary:
          "Every file in an upload request failed to reach Cloudinary. Customers cannot upload " +
          "documents, which means they cannot place orders at all. Existing orders are unaffected. " +
          "Check Cloudinary's status page and that the CLOUDINARY_* credentials are still valid.",
        facts: {
          files_in_request: failed.length,
          storage_failures: storageFailures,
        },
      });
    }
  }

  // A completed upload, which is the step before order creation in the
  // funnel. Emitted once per request rather than once per file, because the
  // customer performed one action.
  if (succeeded.length > 0) {
    trackEvent({
      event: EVENTS.DOCUMENT_UPLOAD_COMPLETED,
      userId: req.user.id,
      properties: {
        file_count: succeeded.length,
        page_count: succeeded.reduce(
          (sum, item) => sum + (item.page_count || 0),
          0,
        ),
        source: "backend",
      },
    });
  }
};

module.exports = { uploadFiles };
