const express = require("express");
const multer = require("multer");
const router = express.Router();
const { uploadFiles } = require("../controllers/uploadController");
const { verifyToken } = require("../middleware/auth");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 10;

// Hold files in memory until they are validated and prepared for storage.
//
// No fileFilter here on purpose: PDF/extension validation happens per
// file in uploadController.js instead, so one bad file in a batch of 10
// can be reported as "failed" without multer aborting the other 9 (its
// fileFilter can only accept/reject the whole request, not skip a file).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Upload up to 10 print documents at once. Returns { succeeded, failed }
// - each succeeded entry's upload_id is what POST /orders later exchanges
// for the real file URL and (server-computed) page count.
//
// NOTE ON AUTH: verifyToken is already applied here, so a customer must be
// logged in to upload. It is not optional - uploadController reads
// req.user.id to record who owns each file, and POST /orders later checks
// that the order's creator is the same user who uploaded it. Without this
// middleware the route would be an open relay into our Cloudinary account.
router.post("/", verifyToken, upload.array("documents", MAX_FILES), uploadFiles);

// Turns multer's errors into clear JSON messages instead of an HTML stack
// trace. Must take four arguments for Express to treat it as error middleware.
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "One of the files is too large. Maximum size is 10MB each." });
  }
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      message: `Too many files, or wrong field name. Send up to ${MAX_FILES} files under the field name 'documents'.`,
    });
  }
  res.status(400).json({ message: err.message || "Upload rejected." });
});

module.exports = router;
