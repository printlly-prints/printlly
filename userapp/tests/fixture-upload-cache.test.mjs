import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createUploadCache, TTL, MAX_FILE } = require('../qa/upload-cache.cjs');
const { PDFDocument } = require('pdf-lib');
const modulePath = require.resolve('../qa/upload-cache.cjs');

test('actual PDF bytes and server page count survive a fresh fixture process', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printlly-upload-test-'));
  try {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    const entry = createUploadCache(directory).put({ original_name: 'notes.pdf', page_count: 2, bytes });
    const script = `const c=require(process.argv[1]).createUploadCache(process.argv[2]);const e=c.get(process.argv[3]);process.stdout.write(JSON.stringify({pages:e.page_count,pdf:e.bytes.toString('base64')}));`;
    const restored = JSON.parse(execFileSync(process.execPath, ['-e', script, modulePath, directory, entry.upload_id], { encoding: 'utf8' }));
    assert.equal(restored.pages, 2);
    assert.deepEqual(Buffer.from(restored.pdf, 'base64'), bytes);
    assert.equal((await PDFDocument.load(Buffer.from(restored.pdf, 'base64'))).getPageCount(), 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('expired, unknown and oversized uploads require reupload without guessing content', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'printlly-upload-test-'));
  try {
    const pdf = await PDFDocument.create(); pdf.addPage();
    const cache = createUploadCache(directory);
    const entry = cache.put({ original_name: 'notes.pdf', page_count: 1, bytes: Buffer.from(await pdf.save()) });
    const file = path.join(directory, `${entry.upload_id}.json`);
    const old = new Date(Date.now() - TTL - 1000); fs.utimesSync(file, old, old);
    assert.equal(cache.get(entry.upload_id), null);
    assert.equal(fs.existsSync(file), false);
    assert.equal(cache.get('qa-upload-1'), null);
    assert.equal(cache.get('../private'), null);
    assert.throws(() => cache.put({ original_name: 'large.pdf', page_count: 1, bytes: Buffer.alloc(MAX_FILE + 1) }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('order creation returns actionable 410 for lost uploads, never an invented PDF', async () => {
  const { handle } = require('../qa/order-fixture.cjs');
  let response;
  await handle({ req: { method: 'POST' }, pathname: '/orders', input: { shop_id: 'fixture-shop', documents: [{ upload_id: 'qa-upload-1', page_count: 999 }] }, shop: { _id: 'fixture-shop' }, respond: (status, body) => { response = { status, body }; } });
  assert.equal(response.status, 410);
  assert.equal(response.body.code, 'UPLOAD_EXPIRED');
  assert.deepEqual(response.body.missing_upload_ids, ['qa-upload-1']);
});
