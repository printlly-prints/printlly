// Disposable loopback-only visual QA fixture. No database, gateway or real users.
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { normalizeServiceName } = require('../backend/utils/shopServices');
const { computeShopAvailability } = require('../backend/utils/shopStatus');
const { round2 } = require('../backend/utils/settlement');
const { calculateQueuePressure, workloadUnits } = require('../backend/utils/queuePressure');
const nonNegativeNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function serviceValidation(body, required) {
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'name is required and must be a non-empty string';
    if (body.name.trim().length > 60) return 'name must be 60 characters or fewer';
  } else if (required) return 'name is required';
  if (body.rate !== undefined) { if (!nonNegativeNumber(body.rate)) return 'rate must be a number >= 0'; }
  else if (required) return 'rate is required';
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return 'enabled must be a boolean';
}
const owner = { id: 'qa-owner', name: 'QA Partner', email: 'partner@example.test', phone: '0000000000', role: 'shop_owner' };
const shop = {
  _id: 'qa-shop', owner_id: 'qa-owner', shop_name: 'QA Print Shop', address: 'Visual QA street', contact: '0000000000',
  is_active: true, verification_status: 'approved', shop_status: 'open', effective_status: 'open', is_open: true,
  business_hours: { enabled: false, open_time: '09:00', close_time: '20:00' },
  pricing: { rate_per_page_bw: 2, rate_per_page_color: 8, paper_size_rates: { A4: 0, A3: 5 }, sides_extra_rate: 1, services: [] },
  owner_photo_url: null, shop_photo_url: null, locality: 'Visual QA',
};
let orders = ['pending', 'accepted', 'ready_for_pickup', 'completed', 'cancelled', 'expired'].map((status, index) => ({
  _id: `qa-order-${index + 1}`, customer_id: { _id: 'qa-customer', name: 'QA Customer', phone: '0000000000' },
  shop_id: shop, status, payment_status: 'paid', otp: '012345', createdAt: new Date(Date.now() - (index + 1) * 180000).toISOString(),
  updatedAt: new Date().toISOString(), total_amount: 39, base_subtotal: 36, platform_fee: 3, vendor_amount: 36, settlement_status: 'unsettled',
  documents: [{ upload_id: `qa-upload-${index + 1}`, original_name: 'QA-notes.pdf', page_count: 12, color_mode: 'bw', paper_size: 'A4', copies: 1, sides: 'double', services: [], pricing: { page_subtotal: 24, paper_subtotal: 0, sides_subtotal: 12, services_subtotal: 0, total: 36 } }],
}));
// Synthetic preparation history, not fabricated ETA or accounting orders.
// The production pure calculation converts these observed job sizes/times
// and the fixture's actual paid preparation queue into the response.
const readyHistory = [42, 34, 26, 18, 10].map(minutes => ({
  at: new Date(Date.now() - minutes * 60000),
  units: workloadUnits([{ page_count: 24, copies: 1, services: [] }]),
}));
function queueInfo() {
  const now = new Date();
  const queued = orders.filter(order => order.payment_status === 'paid' && ['pending', 'accepted'].includes(order.status));
  const recent = readyHistory.filter(entry => now - entry.at <= 60 * 60000).sort((a, b) => a.at - b.at);
  return calculateQueuePressure({ now, closed: availability().effective_status === 'closed',
    active: { queued: queued.length, ready: orders.filter(order => order.payment_status === 'paid' && order.status === 'ready_for_pickup').length,
      units: queued.reduce((sum, order) => sum + workloadUnits(order.documents), 0) },
    recent: { count: recent.length, units: recent.reduce((sum, entry) => sum + entry.units, 0),
      first: recent[0]?.at, last: recent.at(-1)?.at, first_units: recent[0]?.units },
  });
}
// Historical transfer is explicitly synthetic and read-only; no payout route.
const settlements = [{ _id: 'qa-settlement-1', settled_at: new Date(Date.now() - 86400000 * 7).toISOString(), total_amount: 72, order_count: 2, reference_note: 'LOCAL QA — recorded transfer' }];
function availability() {
  const { status, prep_minutes } = computeShopAvailability(shop);
  return { shop_status: shop.shop_status, busy_until: shop.busy_until ?? null, busy_prep_minutes: shop.busy_prep_minutes ?? null, business_hours: shop.business_hours, effective_status: status, effective_prep_minutes: prep_minutes, is_open: status !== 'closed' };
}
http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1):517[34]$/.test(origin || '')) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  const reply = (code, data) => { res.writeHead(code); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1');
  let content = ''; for await (const chunk of req) content += chunk;
  let body = {}; try { body = JSON.parse(content || '{}'); } catch {}
  if (req.method === 'POST' && url.pathname === '/auth/login') return reply(200, { token: 'local-partner-qa', user: owner });
  if (req.method === 'POST' && url.pathname === '/auth/register') {
    if (!body.name || !body.phone || !body.email || !body.password || body.role !== 'shop_owner') return reply(400, { message: 'Required account fields missing' });
    return reply(201, { token: 'local-partner-qa', user: { ...owner, ...body, password: undefined } });
  }
  if (req.method === 'GET' && url.pathname === '/shops/me') return reply(200, { ...shop, ...availability(), queue: queueInfo() });
  // Read-only settings fixture for checking fallback explanations/layout.
  if (req.method === 'GET' && url.pathname === '/admin/settings') return reply(200, {
    platform_fee_type: 'flat', platform_fee_value: 3, rush_thresholds: { low_max: 2, medium_max: 6 },
  });
  if (req.method === 'GET' && url.pathname === '/shops/me/pricing') return reply(200, shop.pricing);
  if (req.method === 'PATCH' && url.pathname === '/shops/me/pricing') {
    const next = structuredClone(shop.pricing);
    for (const key of ['rate_per_page_bw', 'rate_per_page_color', 'sides_extra_rate']) {
      if (body[key] !== undefined) {
        if (!nonNegativeNumber(body[key])) return reply(400, { message: `${key} must be a number >= 0` });
        next[key] = body[key];
      }
    }
    if (body.paper_size_rates !== undefined) {
      if (typeof body.paper_size_rates !== 'object' || body.paper_size_rates === null) return reply(400, { message: 'paper_size_rates must be an object' });
      for (const key of ['A4', 'A3']) if (body.paper_size_rates[key] !== undefined) {
        if (!nonNegativeNumber(body.paper_size_rates[key])) return reply(400, { message: `paper_size_rates.${key} must be a number >= 0` });
        next.paper_size_rates[key] = body.paper_size_rates[key];
      }
    }
    if (body.sides_surcharge_percent !== undefined) return reply(400, { message: 'sides_surcharge_percent no longer exists - set sides_extra_rate, a flat amount per page for double-sided.' });
    if (body.services !== undefined) return reply(400, { message: 'Services are managed individually now - use POST/PATCH/DELETE /shops/me/pricing/services.' });
    shop.pricing = next; return reply(200, shop.pricing);
  }
  const servicePath = url.pathname.match(/^\/shops\/me\/pricing\/services(?:\/([^/]+))?$/);
  if (servicePath && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    const services = shop.pricing.services;
    if (req.method === 'POST' && !servicePath[1]) {
      const error = serviceValidation(body, true); if (error) return reply(400, { message: error });
      if (services.length >= 20) return reply(400, { message: 'A shop can list at most 20 services. Remove one before adding another.' });
      if (services.some(service => normalizeServiceName(service.name) === normalizeServiceName(body.name))) return reply(409, { message: `You already offer a service called "${body.name.trim()}".` });
      services.push({ _id: randomBytes(12).toString('hex'), name: body.name.trim(), rate: body.rate, enabled: body.enabled === undefined ? true : body.enabled });
      return reply(201, services);
    }
    if (servicePath[1] && ['PATCH', 'DELETE'].includes(req.method)) {
      const index = services.findIndex(service => service._id === servicePath[1]);
      if (index < 0) return reply(404, { message: 'Service not found' });
      if (req.method === 'DELETE') { services.splice(index, 1); return reply(200, services); }
      if (body.name === undefined && body.rate === undefined && body.enabled === undefined) return reply(400, { message: 'Send name, rate and/or enabled to update.' });
      const error = serviceValidation(body, false); if (error) return reply(400, { message: error });
      if (body.name !== undefined && services.some((service, i) => i !== index && normalizeServiceName(service.name) === normalizeServiceName(body.name))) return reply(409, { message: `You already offer a service called "${body.name.trim()}".` });
      for (const key of ['name', 'rate', 'enabled']) if (body[key] !== undefined) services[index][key] = key === 'name' ? body.name.trim() : body[key];
      return reply(200, services);
    }
  }
  if (req.method === 'GET' && url.pathname === '/shops/me/settlements') {
    const pending = orders.filter(order => order.status === 'completed' && order.payment_status === 'paid' && order.settlement_status === 'unsettled');
    return reply(200, { unsettled: { order_count: pending.length, total_amount: round2(pending.reduce((sum, order) => sum + (order.vendor_amount || 0), 0)), oldest_order_at: pending.length ? pending.map(order => order.createdAt).sort()[0] : null }, settlements });
  }
  if (req.method === 'PATCH' && url.pathname === '/shops/me/status') {
    if (['is_open', 'shop_status', 'busy_prep_minutes', 'busy_for_minutes', 'business_hours'].every(key => body[key] === undefined)) return reply(400, { message: 'Send shop_status and/or business_hours to update.' });
    const next = structuredClone(shop);
    let nextStatus = body.shop_status;
    if (nextStatus === undefined && body.is_open !== undefined) {
      if (typeof body.is_open !== 'boolean') return reply(400, { message: 'is_open must be a boolean' });
      nextStatus = body.is_open ? 'open' : 'closed';
    }
    if (nextStatus !== undefined) {
      if (!['open', 'busy', 'closed'].includes(nextStatus)) return reply(400, { message: 'shop_status must be "open", "busy" or "closed"' });
      next.shop_status = nextStatus;
    }
    if (next.shop_status === 'busy') {
      if (body.busy_prep_minutes !== undefined) {
        if (!Number.isInteger(body.busy_prep_minutes) || body.busy_prep_minutes < 1 || body.busy_prep_minutes > 240) return reply(400, { message: 'busy_prep_minutes must be a whole number of minutes between 1 and 240' });
        next.busy_prep_minutes = body.busy_prep_minutes;
      }
      if (body.busy_for_minutes !== undefined) {
        if (body.busy_for_minutes !== null && (!Number.isInteger(body.busy_for_minutes) || body.busy_for_minutes < 1 || body.busy_for_minutes > 1440)) return reply(400, { message: 'busy_for_minutes must be a whole number of minutes between 1 and 1440, or null' });
        next.busy_until = body.busy_for_minutes === null ? null : new Date(Date.now() + body.busy_for_minutes * 60000).toISOString();
      }
    } else if (nextStatus !== undefined) { next.busy_until = null; next.busy_prep_minutes = null; }
    if (body.business_hours !== undefined) {
      if (typeof body.business_hours !== 'object' || body.business_hours === null) return reply(400, { message: 'business_hours must be an object' });
      for (const key of ['open_time', 'close_time']) if (body.business_hours[key] !== undefined) {
        if (typeof body.business_hours[key] !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(body.business_hours[key])) return reply(400, { message: `business_hours.${key} must be in 24-hour HH:MM format` });
        next.business_hours[key] = body.business_hours[key];
      }
      if (body.business_hours.enabled !== undefined) {
        if (typeof body.business_hours.enabled !== 'boolean') return reply(400, { message: 'business_hours.enabled must be a boolean' });
        next.business_hours.enabled = body.business_hours.enabled;
      }
      if (next.business_hours.enabled && (!next.business_hours.open_time || !next.business_hours.close_time)) return reply(400, { message: 'business_hours.open_time and close_time are required to enable a schedule' });
    }
    Object.assign(shop, next); return reply(200, availability());
  }
  if (req.method === 'GET' && url.pathname === '/shops') return reply(200, [{ ...shop, ...availability(), queue: queueInfo() }]);
  if (req.method === 'GET' && url.pathname === '/orders/shop/qa-shop') {
    const skip = Number(url.searchParams.get('skip') || 0), limit = Number(url.searchParams.get('limit') || 100);
    return reply(200, orders.slice(skip, skip + limit));
  }
  const action = url.pathname.match(/^\/orders\/(qa-order-\d+)\/(accept|ready|complete)$/);
  if (req.method === 'PATCH' && action) {
    const order = orders.find(o => o._id === action[1]);
    if (!order) return reply(404, { message: 'Order not found' });
    const transitions = { accept: ['pending', 'accepted'], ready: ['accepted', 'ready_for_pickup'], complete: ['ready_for_pickup', 'completed'] };
    if (order.status !== transitions[action[2]][0]) return reply(400, { message: 'Order is not in the required state' });
    if (action[2] === 'complete' && body.otp !== order.otp) return reply(400, { message: 'Pickup code does not match. Try again.' });
    order.status = transitions[action[2]][1]; order.updatedAt = new Date().toISOString();
    if (action[2] === 'ready') readyHistory.push({ at: new Date(), units: workloadUnits(order.documents) });
    return reply(200, order);
  }
  if (req.method === 'GET' && url.pathname === '/notifications') return reply(200, []);
  return reply(404, { message: 'Endpoint unavailable in this local QA fixture' });
}).listen(5180, '127.0.0.1', () => console.log('Partner QA API: http://127.0.0.1:5180 (memory only)'));
