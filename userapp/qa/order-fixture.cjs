// Local flow fixtures. PDFs survive restarts for up to 24 hours in a bounded OS-temp cache.
const { PDFDocument } = require('pdf-lib');
const { createUploadCache } = require('./upload-cache.cjs');
const uploads = createUploadCache(process.env.PRINTLLY_QA_UPLOAD_CACHE);
const { stampFixtureReady } = require('./fixture-queue.cjs');
const orders = [];
const pricing = { rate_per_page_bw: 2, rate_per_page_color: 8, paper_size_rates: { A4: 0, A3: 5 }, sides_extra_rate: 1,
  services: [{ _id: 'qa-staple', name: 'Stapling', rate: 5, enabled: true }] };
let sequence = 0;

function price(documents) {
  const priced = documents.map(doc => {
    const copies = doc.copies || 1;
    if (!Number.isInteger(copies) || copies < 1 || !Number.isInteger(doc.page_count) || doc.page_count < 1) throw new Error('Document pages and copies must be positive whole numbers');
    const services = (doc.services || []).map(name => {
      const match = pricing.services.find(service => service.name.toLowerCase() === String(name).toLowerCase() && service.enabled);
      if (!match) throw new Error('A requested service is unavailable');
      return { name: match.name, rate: match.rate };
    });
    const base = doc.page_count * copies * (doc.color_mode === 'color' ? pricing.rate_per_page_color : pricing.rate_per_page_bw);
    const paper_charge = doc.page_count * copies * (pricing.paper_size_rates[doc.paper_size || 'A4'] || 0);
    const sides_charge = doc.sides === 'double' ? doc.page_count * copies * pricing.sides_extra_rate : 0;
    const services_charge = services.reduce((sum, service) => sum + service.rate, 0);
    return { ...doc, copies, color_mode: doc.color_mode || 'bw', sides: doc.sides || 'single', paper_size: doc.paper_size || 'A4', services,
      pricing: { base, paper_charge, sides_charge, services_charge, document_total: base + paper_charge + sides_charge + services_charge } };
  });
  const sum = key => priced.reduce((total, doc) => total + doc.pricing[key], 0);
  const base_subtotal = sum('base'), paper_size_charge = sum('paper_charge'), sides_charge = sum('sides_charge'), services_charge = sum('services_charge');
  return { documents: priced, base_subtotal, paper_size_charge, sides_charge, services_charge, platform_fee: 3,
    total_amount: base_subtotal + paper_size_charge + sides_charge + services_charge + 3 };
}

function multipartFiles(raw, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.slice(1).find(Boolean);
  if (!boundary) return [];
  const marker = Buffer.from(`--${boundary}`), files = [];
  let position = raw.indexOf(marker);
  while (position >= 0) {
    const next = raw.indexOf(marker, position + marker.length);
    if (next < 0) break;
    const part = raw.subarray(position + marker.length + 2, next - 2), headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString(), name = headers.match(/filename="([^"]*)"/)?.[1];
      if (name && /name="documents"/.test(headers)) files.push({ name, mime: headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1], bytes: part.subarray(headerEnd + 4) });
    }
    position = next;
  }
  return files;
}

async function handle({ req, res, pathname, input, raw, respond, shop, allOrders = orders, currentShop = value => value }) {
  if (pathname === '/pricing-config' && req.method === 'GET') { respond(200, { platform_fee_type: 'flat', platform_fee_value: 3 }); return true; }
  const download = pathname.match(/^\/qa-files\/(qa-upload-[a-z0-9-]+)\.pdf$/);
  if (download) {
    const upload = uploads.get(download[1]);
    if (!upload) respond(410, { code: 'UPLOAD_EXPIRED', message: 'This uploaded file has expired. Upload it again to continue.', missing_upload_ids: [download[1]] });
    else { res.setHeader('Content-Type', 'application/pdf'); res.writeHead(200); res.end(upload.bytes); }
    return true;
  }
  if (pathname === '/upload' && req.method === 'POST') {
    const files = multipartFiles(raw, req.headers['content-type'] || '');
    if (!files.length || files.length > 10) { respond(400, { message: 'Choose between 1 and 10 PDF files' }); return true; }
    const succeeded = [], failed = [];
    for (const file of files) {
      try {
        if (file.mime !== 'application/pdf' || !/\.pdf$/i.test(file.name) || file.bytes.length > 10 * 1024 * 1024) throw new Error('The server requires PDFs up to 10 MB');
        const pdf = await PDFDocument.load(file.bytes); const page_count = pdf.getPageCount();
        if (!page_count) throw new Error('This PDF has no pages');
        succeeded.push(uploads.put({ original_name: file.name, page_count, bytes: file.bytes }));
      } catch (error) { failed.push({ original_name: file.name, error: error.message }); }
    }
    respond(200, { succeeded, failed }); return true;
  }
  if (pathname === '/shops/compare-pricing' && req.method === 'POST') {
    try {
      if (!Array.isArray(input.documents) || !input.documents.length) throw new Error('Documents are required');
      const result = price(input.documents);
      respond(200, [{ shop_id: shop._id, shop_name: shop.shop_name, address: shop.address, shop_photo_url: null,
        shop_status: shop.shop_status, is_currently_open: shop.is_currently_open, total_amount: result.total_amount,
        price_breakdown: { ...result, documents: undefined, total_amount: undefined }, document_totals: result.documents.map(doc => doc.pricing.document_total),
        document_services: result.documents.map(doc => doc.services), queue: shop.queue }]);
    } catch (error) { respond(400, { message: error.message }); }
    return true;
  }
  if (pathname === '/orders' && req.method === 'POST') {
    try {
      if (input.shop_id !== shop._id || !Array.isArray(input.documents) || !input.documents.length || input.documents.length > 10) throw new Error('Choose a supported shop and 1–10 documents');
      const missing = input.documents.filter(doc => !uploads.get(doc.upload_id)).map(doc => doc.upload_id);
      if (missing.length) { respond(410, { code: 'UPLOAD_EXPIRED', message: 'Some uploaded files have expired. Upload them again to continue.', missing_upload_ids: missing }); return true; }
      const documents = input.documents.map(doc => {
        const upload = uploads.get(doc.upload_id); if (!upload) throw new Error('An uploaded PDF could not be found');
        return { ...doc, original_name: upload.original_name, page_count: upload.page_count, file_url: upload.file_url };
      });
      const order = { _id: `qa-created-order-${++sequence}`, customer_id: 'qa-customer', shop_id: { ...shop, pricing }, instructions: input.instructions || '',
        ...price(documents), status: 'pending', payment_status: 'created', otp: null, vendor_amount: null, settlement_status: 'unsettled', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      orders.unshift(order); respond(201, order);
    } catch (error) { respond(400, { message: error.message }); }
    return true;
  }
  if (pathname.startsWith('/payments/razorpay/')) { respond(503, { message: 'The UPI provider is unavailable in this local fixture. No payment was initiated.' }); return true; }
  const update = pathname.match(/^\/qa\/orders\/([^/]+)\/state$/);
  if (update && req.method === 'PATCH') {
    const order = allOrders.find(item => item._id === update[1]);
    if (!order) respond(404, { message: 'Fixture order not found' });
    else if (!['pending','accepted','ready_for_pickup','completed','cancelled','expired'].includes(input.status)) respond(400, { message: 'Unknown fixture order state' });
    else if (input.status === 'ready_for_pickup' && !['accepted', 'ready_for_pickup'].includes(order.status)) respond(400, { message: 'Only an accepted order can be marked ready' });
    else {
      stampFixtureReady(order, input.status);
      order.status = input.status; order.updatedAt = new Date().toISOString();
      if (input.payment_status === 'paid') { order.payment_status = 'paid'; order.otp = '012345'; order.vendor_amount = order.total_amount - order.platform_fee; }
      respond(200, { ...order, shop_id: currentShop(order.shop_id) });
    }
    return true;
  }
  return false;
}
module.exports = { handle, orders, pricing };
