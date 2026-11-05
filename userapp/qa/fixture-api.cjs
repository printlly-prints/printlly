// Local visual QA only. Orders/accounts are in memory; test PDFs use a bounded
// temporary cache. This server never connects to Printlly's
// backend, database, storage or payment gateway. Bind to loopback only.
const http = require("node:http");
const orderFixture = require("./order-fixture.cjs");
const { validateProfileDetails } = require("../../backend/utils/profileDetails");
const { queueForShop } = require("./fixture-queue.cjs");
let customer = null;
const shop = { _id: "qa-shop", shop_name: "Paper Street Print", address: "Clock Tower, Dehradun", locality: "Clock Tower", contact: "", shop_status: "open", is_currently_open: true };
const closedShop = { _id: "qa-shop-closed", shop_name: "Campus Copy", address: "College Road", locality: "Clement Town", shop_status: "closed", is_currently_open: false };
const shopDetails = { ...shop, business_hours: { open_time: "09:00", close_time: "19:00" }, pricing: { rate_per_page_bw: 2, rate_per_page_color: 10, paper_size_rates: { A4: 0, A3: 2 }, sides_extra_rate: 1, services: [{ _id: "qa-service", name: "Binding", rate: 20, enabled: true }] } };
const order = { _id: "qa-order", shop_id: shop, status: "accepted", payment_status: "paid", otp: "012345", documents: [{ original_name: "Research-notes.pdf", page_count: 12 }, { original_name: "Poster.pdf", page_count: 2 }], total_amount: 47, base_subtotal: 44, platform_fee: 3, createdAt: "2026-10-14T08:00:00Z" };
let savedShops = [{ _id: "qa-saved-1", shop_id: { ...shop, distance_km: 0.4 } }, { _id: "qa-saved-2", shop_id: { _id: "qa-shop-closed", shop_name: "Campus Copy", address: "College Road", shop_status: "closed", is_currently_open: false, distance_km: 1.2 } }];
const allOrders = () => [...orderFixture.orders, order];
const currentShop = value => ({ ...value, queue: queueForShop(value, allOrders()) });
const currentOrder = value => ({ ...value, shop_id: currentShop(value.shop_id) });
let notifications = [
  { _id: "qa-notification-1", order_id: order._id, title: "Order accepted", body: "Paper Street Print has accepted your order.", type: "order_accepted", read: false, created_at: "2026-10-14T08:10:00Z" },
  { _id: "qa-notification-2", order_id: order._id, title: "Payment confirmed", body: "Your payment is confirmed. View your order for pickup details.", type: "payment_success", read: false, created_at: "2026-10-14T08:00:00Z" },
];
let messages = [
  { _id: "qa-message-3", sender_role: "admin", text: "How can we help with your order?", created_at: "2026-10-14T08:20:00Z" },
  { _id: "qa-message-4", sender_role: "customer", text: "When can I collect my prints?", order_context: { order_id: order._id, shop_name: shop.shop_name }, created_at: "2026-10-14T08:21:00Z" },
  { _id: "qa-message-5", sender_role: "admin", text: "The shop has accepted your order. Your order status will show when it is ready for pickup.", created_at: "2026-10-14T08:22:00Z" },
];
const olderMessages = [
  { _id: "qa-message-1", sender_role: "customer", text: "Hello, I have a question about my print order.", created_at: "2026-10-14T08:18:00Z" },
  { _id: "qa-message-2", sender_role: "admin", text: "You can find the latest status in Your orders.", created_at: "2026-10-14T08:19:00Z" },
];
let supportUnread = 2;
let messageSequence = 5;
let failNextSupportMessage = false;
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:8082");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname;
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks), body = raw.toString("utf8");
  let input = {}; try { input = JSON.parse(body || "{}"); } catch {}
  const respond = (status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };
  if (pathname === "/qa/support/fail-next-message" && req.method === "POST") { failNextSupportMessage = true; respond(200, { armed: true }); return; }
  if (await orderFixture.handle({ req, res, pathname, input, raw, respond, shop: currentShop(shop), allOrders: allOrders(), currentShop })) return;
  if (pathname === "/auth/login") {
    if (!customer) { respond(401, { message: "New visual-QA account" }); return; }
    respond(200, { token: "local-visual-qa-session", user: customer }); return;
  }
    if (pathname === "/auth/profile" && ["GET", "PATCH"].includes(req.method)) {
      if (!req.headers.authorization || !customer) { respond(401, { message: "Invalid or expired token" }); return; }
      if (req.method === "PATCH") {
        const result = validateProfileDetails(input);
        if (result.error || !Object.keys(result.updates).length) { respond(400, { message: result.error || "No profile details supplied" }); return; }
        customer = { ...customer, ...result.updates };
      }
      respond(200, { user: customer }); return;
    }
    if (pathname === "/auth/register") {
      const result = validateProfileDetails(input, { allowOtherFields: true });
      if (result.error) { respond(400, { message: result.error }); return; }
      customer = { id: "qa-customer", name: input.name || "QA Customer", phone: input.phone, email: input.email, role: "customer", contact_email: null, date_of_birth: null, ...result.updates };
    respond(201, { token: "local-visual-qa-session", user: customer }); return;
  }
  if (pathname === "/orders/customer") { respond(200, allOrders().map(currentOrder)); return; }
  if (pathname === "/shops") { const search = (url.searchParams.get("search") || "").toLowerCase(); respond(200, [shop, closedShop].map(currentShop).filter(item => [item.shop_name, item.address, item.locality].some(value => value.toLowerCase().includes(search)))); return; }
  if (pathname === "/shops/qa-shop" && req.method === "GET") { respond(200, currentShop(shopDetails)); return; }
  if (pathname === "/shops/qa-shop-closed" && req.method === "GET") { respond(200, currentShop({ ...closedShop, pricing: shopDetails.pricing })); return; }
  const shopQueue = pathname.match(/^\/shops\/([^/]+)\/queue$/);
  if (shopQueue && req.method === "GET") {
    const found = [shop, closedShop].find(item => item._id === shopQueue[1]);
    respond(found ? 200 : 404, found ? currentShop(found).queue : { message: "Shop not found" }); return;
  }
  if (pathname === "/notifications" && req.method === "GET") { respond(200, notifications); return; }
  if (pathname === "/notifications/read-all" && req.method === "PATCH") { const updated = notifications.filter(item => !item.read).length; notifications = notifications.map(item => ({ ...item, read: true })); respond(200, { updated }); return; }
  const readNotification = pathname.match(/^\/notifications\/([^/]+)\/read$/);
  if (readNotification && req.method === "PATCH") {
    const found = notifications.find(item => item._id === readNotification[1]);
    if (!found) { respond(404, { message: "Notification not found" }); return; }
    found.read = true; respond(200, found); return;
  }
  if (pathname === "/saved-shops" && req.method === "GET") { respond(200, savedShops.map(item => ({ ...item, shop_id: currentShop(item.shop_id) }))); return; }
  if (pathname.startsWith("/saved-shops/") && req.method === "DELETE") { savedShops = savedShops.filter(item => item.shop_id._id !== pathname.slice("/saved-shops/".length)); respond(200, { message: "Shop removed from saved list" }); return; }
  if (pathname === "/saved-shops" && req.method === "POST") {
    if (savedShops.some(item => item.shop_id._id === input.shop_id)) { respond(409, { message: "This shop is already saved" }); return; }
    const entry = { _id: `qa-saved-${input.shop_id}`, shop_id: input.shop_id };
    savedShops.push({ ...entry, shop_id: { ...shop, _id: input.shop_id } }); respond(201, entry); return;
  }
  if (pathname === "/support/conversation" && req.method === "GET") {
    const before = url.searchParams.get("before");
    const page = before ? olderMessages.filter(item => item.created_at < before) : messages;
    respond(200, { messages: page, conversation: { _id: "qa-conversation", unread_by_customer: supportUnread }, has_more: !before, oldest_created_at: page[0]?.created_at || null }); return;
  }
  if (pathname === "/support/conversation/read" && req.method === "PATCH") { supportUnread = 0; respond(200, { _id: "qa-conversation", unread_by_customer: 0 }); return; }
  if (pathname === "/support/conversation/messages" && req.method === "POST") {
    if (failNextSupportMessage) { failNextSupportMessage = false; respond(503, { message: "The local QA connection failed. Please try again." }); return; }
    const text = String(input.text || "").trim();
    if (!text || text.length > 2000) { respond(400, { message: "Message must contain between 1 and 2000 characters" }); return; }
    const message = { _id: `qa-message-${++messageSequence}`, sender_role: "customer", text, created_at: new Date().toISOString(), ...(input.order_context ? { order_context: { ...input.order_context, shop_name: shop.shop_name } } : {}) };
    messages.push(message); respond(201, message); return;
  }
  if (pathname === "/qa/reset" && req.method === "POST") { customer = null; respond(200, { reset: true }); return; }
  respond(404, { message: "Endpoint unavailable in the local visual QA fixture" });
});
server.listen(Number(process.env.PRINTLLY_QA_PORT || 8083), "127.0.0.1", () => console.log(`Visual QA fixture API: http://127.0.0.1:${server.address().port} (test data; no live gateway)`));
