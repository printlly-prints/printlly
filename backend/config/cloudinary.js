const { v2: cloudinary } = require("cloudinary");

// Cloudinary is where customer print files are stored. The shop owner's
// dashboard opens the returned secure_url to view/print the document.
// Credentials come from .env (see .env.example).
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
