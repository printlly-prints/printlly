// Run only against the loopback fixture; never against a real API or gateway.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { PDFDocument } = require('pdf-lib');
const base = 'http://127.0.0.1:8083';

async function json(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, value: await response.json() };
}
async function upload(bytes, name, mimeType) {
  const form = new FormData(); form.append('documents', new Blob([bytes], { type: mimeType }), name);
  const response = await fetch(base + '/upload', { method: 'POST', body: form });
  return response.json();
}

(async () => {
  const { imageBytesToPdf } = await import('../src/utils/imagePdf.js');
  const source = new Uint8Array(await fs.readFile(require('node:path').join(__dirname, '../tests/fixtures/wide-image.png')));
  const rejected = await upload(source, 'qa-image.png', 'image/png');
  assert.equal(rejected.succeeded.length, 0); assert.equal(rejected.failed.length, 1);
  const converted = await imageBytesToPdf(source, { fileName: 'qa-image.png', mimeType: 'image/png' });
  const uploaded = await upload(converted.bytes, converted.fileName, converted.mimeType);
  assert.equal(uploaded.succeeded.length, 1); assert.equal(uploaded.succeeded[0].page_count, 1);
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  const twoPages = await upload(await pdf.save(), 'qa-two-pages.pdf', 'application/pdf');
  assert.equal(twoPages.succeeded[0].page_count, 2);
  const settings = { color_mode: 'bw', paper_size: 'A4', sides: 'single', copies: 2, services: ['Stapling'] };
  const comparison = await json('/shops/compare-pricing', 'POST', { documents: [{ ...settings, page_count: 1 }] });
  assert.equal(comparison.status, 200); assert.equal(comparison.value[0].total_amount, 12);
  const created = await json('/orders', 'POST', { shop_id: 'qa-shop', documents: [{ ...settings, upload_id: uploaded.succeeded[0].upload_id, page_count: 999 }] });
  assert.equal(created.status, 201); assert.equal(created.value.documents[0].page_count, 1); assert.equal(created.value.total_amount, 12);
  assert.equal(created.value.payment_status, 'created'); assert.equal(created.value.otp, null); assert.equal(created.value.vendor_amount, null);
  const unavailable = await json('/payments/razorpay/create-order', 'POST', { order_id: created.value._id });
  assert.equal(unavailable.status, 503);
  const invalid = await json(`/qa/orders/${created.value._id}/state`, 'PATCH', { status: 'printing' }); assert.equal(invalid.status, 400);
  const confirmed = await json(`/qa/orders/${created.value._id}/state`, 'PATCH', { status: 'ready_for_pickup', payment_status: 'paid' });
  assert.equal(confirmed.value.otp, '012345'); assert.equal(confirmed.value.vendor_amount, 9);
  const current = await json('/orders/customer'); assert.ok(current.value.some(order => order._id === created.value._id && order.payment_status === 'paid'));
  console.log('Local core fixture smoke passed: image conversion, independent page counts, quote/order authority, unpaid code gate, provider-unavailable recovery and confirmed fixture state. No gateway or production services used.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
