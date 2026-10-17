// Local test PDFs only; never used by the production backend.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_FILE = 10 * 1024 * 1024;
const MAX_CACHE = 100 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const validId = id => /^qa-upload-[a-f0-9-]{36}$/.test(id);

function createUploadCache(directory = path.join(os.tmpdir(), 'printlly-local-qa-uploads'), now = Date.now) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = path.resolve(directory);
  const filename = id => path.join(root, `${id}.json`);
  function prune() {
    const entries = [];
    for (const name of fs.readdirSync(root)) {
      const id = name.replace(/\.json$/, '');
      if (!name.endsWith('.json') || !validId(id)) continue;
      const file = filename(id);
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        if (now() - stat.mtimeMs > TTL || stat.size > MAX_FILE * 1.4 + 65536) fs.unlinkSync(file);
        else entries.push({ file, size: stat.size, time: stat.mtimeMs });
      } catch { /* A removed/corrupt cache entry can be reuploaded. */ }
    }
    let size = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.time - b.time)) {
      if (size <= MAX_CACHE) break;
      fs.unlinkSync(entry.file); size -= entry.size;
    }
  }
  function get(id) {
    if (!validId(id)) return null;
    prune();
    try {
      const file = filename(id), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      const bytes = Buffer.from(entry.pdf, 'base64');
      if (entry.upload_id !== id || !Number.isInteger(entry.page_count) || entry.page_count < 1 || !bytes.length || bytes.length > MAX_FILE || bytes.subarray(0, 5).toString() !== '%PDF-') return null;
      const { pdf, ...metadata } = entry;
      return { ...metadata, bytes };
    } catch { return null; }
  }
  function put({ original_name, page_count, bytes }) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_FILE || !Number.isInteger(page_count) || page_count < 1) throw new Error('Invalid fixture PDF');
    const upload_id = `qa-upload-${randomUUID()}`;
    const entry = { upload_id, original_name, page_count, file_url: `http://127.0.0.1:8083/qa-files/${upload_id}.pdf` };
    fs.writeFileSync(filename(upload_id), JSON.stringify({ ...entry, pdf: bytes.toString('base64') }), { mode: 0o600, flag: 'wx' });
    prune();
    return entry;
  }
  prune();
  return { get, put };
}
module.exports = { createUploadCache, TTL, MAX_FILE };
