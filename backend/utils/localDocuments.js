const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const PREFIX = "local-document:";
function localDocumentsEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.LOCAL_DOCUMENTS === "true"
  );
}
function directory() {
  return path.resolve(
    process.env.LOCAL_DOCUMENT_DIR ||
      path.join(__dirname, "../.local-media/print-documents"),
  );
}
function isLocalDocument(url) {
  return typeof url === "string" && url.startsWith(PREFIX);
}
function filename(url) {
  const name = String(url).slice(PREFIX.length);
  if (!isLocalDocument(url) || !/^[a-f0-9-]{36}\.pdf$/.test(name))
    throw Error("Invalid local document reference");
  return name;
}
async function saveLocalDocument(buffer) {
  if (!localDocumentsEnabled())
    throw Error("Local document storage is disabled");
  const name = randomUUID() + ".pdf";
  await fs.mkdir(directory(), { recursive: true });
  await fs.writeFile(path.join(directory(), name), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  return { secure_url: PREFIX + name, public_id: name };
}
async function readLocalDocument(url) {
  if (process.env.NODE_ENV === "production")
    throw Error("Local documents are unavailable");
  return fs.readFile(path.join(directory(), filename(url)));
}
async function removeLocalDocument(url) {
  if (process.env.NODE_ENV === "production")
    throw Error("Local documents are unavailable");
  await fs.unlink(path.join(directory(), filename(url))).catch((e) => {
    if (e.code !== "ENOENT") throw Error("Local document could not be removed");
  });
}
module.exports = {
  localDocumentsEnabled,
  isLocalDocument,
  saveLocalDocument,
  readLocalDocument,
  removeLocalDocument,
};
