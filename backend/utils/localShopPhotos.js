const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function localShopPhotosEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_SHOP_PHOTOS === "true"
  );
}
function photoDirectory() {
  return path.resolve(
    process.env.LOCAL_SHOP_PHOTO_DIR ||
      path.join(__dirname, "../.local-media/shop-photos"),
  );
}
const filenamePattern = /^[a-f0-9-]{36}\.(png|jpg)$/;
async function saveLocalShopPhoto(file, origin) {
  const png = file.buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
  if (
    !(png && file.mimetype === "image/png") &&
    !(jpeg && file.mimetype === "image/jpeg")
  ) {
    const error = new Error("Choose a valid JPG or PNG image.");
    error.status = 400;
    throw error;
  }
  const filename = randomUUID() + (png ? ".png" : ".jpg");
  await fs.mkdir(photoDirectory(), { recursive: true });
  await fs.writeFile(path.join(photoDirectory(), filename), file.buffer, {
    flag: "wx",
  });
  return origin + "/media/shops/" + filename;
}
async function removeLocalShopPhoto(url, origin) {
  if (!url || !url.startsWith(origin + "/media/shops/")) return;
  const filename = url.slice((origin + "/media/shops/").length);
  if (!filenamePattern.test(filename)) return;
  await fs.unlink(path.join(photoDirectory(), filename)).catch((error) => {
    if (error.code !== "ENOENT")
      console.error("Could not remove replaced local shop photo.");
  });
}
function mountLocalShopPhotos(app) {
  if (!localShopPhotosEnabled()) return;
  app.get("/media/shops/:file", (req, res) => {
    if (!filenamePattern.test(req.params.file)) return res.sendStatus(404);
    // Storefront photos are public; KYC and customer documents never use this directory.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendFile(
      req.params.file,
      {
        root: photoDirectory(),
        dotfiles: "deny",
        maxAge: "1y",
        immutable: true,
      },
      (error) => {
        if (error && !res.headersSent) res.sendStatus(error.status || 500);
      },
    );
  });
}
module.exports = {
  localShopPhotosEnabled,
  saveLocalShopPhoto,
  removeLocalShopPhoto,
  mountLocalShopPhotos,
};
