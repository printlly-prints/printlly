import { estimateOrder } from "../utils/estimatePricing.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
const fee = { platform_fee_type: "flat", platform_fee_value: 3 };
export const DEMO_USER = { _id: "demo-customer", name: "Alex", email: "alex@example.test", role: "customer" };
export const DEMO_SESSION = { token: "paprout-offline-demo", user: DEMO_USER };

function sampleShops() {
  return [
    ["demo-copyhub", "CopyHub", "copyhub", 0.4, 2, 8, "low"],
    ["demo-printpoint", "PrintPoint", "printpoint", 0.9, 1.5, 10, "medium"],
    ["demo-quickprint", "QuickPrint", "quickprint", 1.3, 2.5, 9, "low"],
  ].map(([id, name, photo, distance, bw, color, rush]) => ({
    _id: id, shop_name: name, demo_photo: photo, address: "",
    locality: "", distance_km: distance, is_active: true,
    is_open: true, is_currently_open: true, shop_status: "open", contact: "",
    queue: { rush_level: rush, active_orders: rush === "medium" ? 4 : 1 },
    pricing: { rate_per_page_bw: bw, rate_per_page_color: color,
      paper_size_rates: { A4: 0, A3: 2 }, sides_extra_rate: 0.5,
      services: [{ name: "Stapling", rate: 2, enabled: true }, { name: "Spiral binding", rate: 25, enabled: true }] },
  }));
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.response = { status, data: { message } };
  throw error;
}

// In-memory sample data only. No files, credentials or payments leave this process.
export function createDemoStore() {
  const shops = sampleShops();
  const uploads = new Map();
  let sequence = 100;
  const now = () => new Date().toISOString();
  const saved = new Set([shops[0]._id]);
  const messages = [{ _id: "demo-message-1", sender_role: "admin", text: "Hi Alex. What can we help you with?", created_at: now() }];
  const notifications = [{ _id: "demo-notification-1", title: "Your prints are ready", message: "Your order at CopyHub is ready to collect. Take your pickup code with you.", read: false, order_id: "demo-order-ready", createdAt: now(), created_at: now() }];

  function addDocument() {
    const upload_id = `demo-upload-${++sequence}`;
    const doc = { upload_id, original_name: "Project-notes.pdf", page_count: 8 };
    uploads.set(upload_id, doc);
    return copy(doc);
  }

  const sampleDoc = addDocument();
  const standard = { color_mode: "bw", copies: 1, paper_size: "A4", sides: "single", services: [] };
  function orderFor(shop, documents, id) {
    const docs = documents.map((settings) => {
      const file = uploads.get(settings.upload_id);
      if (!file) fail("Choose a document first.");
      return { ...file, ...settings };
    });
    const breakdown = estimateOrder(docs, docs, shop.pricing, fee);
    return { _id: id, customer_id: DEMO_USER._id, shop_id: copy(shop), ...breakdown, documents: docs,
      status: "pending", payment_status: "created", createdAt: now(), updatedAt: now(),
      expires_at: new Date(Date.now() + 86400000).toISOString(), is_demo: true };
  }
  const ready = { ...orderFor(shops[0], [{ ...standard, upload_id: sampleDoc.upload_id }], "demo-order-ready"), status: "ready_for_pickup", payment_status: "paid", otp: "384291" };
  const completed = { ...orderFor(shops[1], [{ ...standard, upload_id: sampleDoc.upload_id }], "demo-order-completed"), status: "completed", payment_status: "paid", otp: "615203" };
  const preparing = { ...orderFor(shops[1], [{ ...standard, copies: 2, upload_id: sampleDoc.upload_id }], "demo-order-preparing"), status: "accepted", payment_status: "paid", otp: "517628" };
  const awaitingPayment = orderFor(shops[2], [{ ...standard, upload_id: sampleDoc.upload_id }], "demo-order-payment");
  const orders = [ready, preparing, awaitingPayment, completed];

  function quote(shop, documents) {
    const breakdown = estimateOrder(documents, documents, shop.pricing, fee);
    if (!breakdown || !Number.isFinite(breakdown.total_amount)) fail("Choose valid print preferences.");
    return { ...copy(shop), shop_id: shop._id, total_amount: breakdown.total_amount,
      price_breakdown: breakdown, document_totals: breakdown.documents.map(d => d.document_total),
      document_services: documents.map(d => (d.services || []).map(name => shop.pricing.services.find(s => s.name.toLowerCase() === name.toLowerCase())).filter(Boolean)) };
  }

  async function request(method, rawUrl, body = {}, params = {}) {
    const path = new URL(rawUrl, "https://demo.invalid").pathname;
    method = method.toUpperCase();
    if (path.startsWith("/payments/")) fail("Payment is unavailable.", 403);
    if (method === "GET" && path === "/shops") {
      const search = String(params.search || params.q || "").toLowerCase();
      return copy(shops.filter(s => `${s.shop_name} ${s.address}`.toLowerCase().includes(search)));
    }
    if (method === "GET" && path.startsWith("/shops/")) {
      const shop = shops.find(s => s._id === path.split("/")[2]);
      if (!shop) fail("Shop not found.", 404);
      return copy(path.endsWith("/queue") ? shop.queue : shop);
    }
    if (method === "POST" && path === "/shops/compare-pricing") {
      if (!Array.isArray(body.documents) || !body.documents.length) fail("Add a PDF first.");
      return shops.filter(s => !body.shop_id || s._id === body.shop_id).map(s => quote(s, body.documents));
    }
    if (method === "GET" && path === "/pricing-config") return copy(fee);
    if (method === "GET" && path === "/orders/customer") return copy(orders);
    if (method === "POST" && path === "/orders") {
      const shop = shops.find(s => s._id === body.shop_id);
      if (!shop) fail("Choose a shop first.");
      if (!Array.isArray(body.documents) || !body.documents.length) fail("Add a PDF first.");
      const order = { ...orderFor(shop, body.documents, `demo-order-${++sequence}`), instructions: body.instructions || "" };
      orders.unshift(order); return copy(order);
    }
    if (method === "POST" && path === "/demo/pay") {
      const order = orders.find(o => o._id === body.order_id);
      if (!order) fail("Order not found.", 404);
      if (order.payment_status !== "paid") { order.payment_status = "paid"; order.otp = "628415"; order.updatedAt = now(); }
      return { order: copy(order) };
    }
    if (method === "POST" && path === "/demo/advance") {
      const order = orders.find(o => o._id === body.order_id);
      if (!order || order.payment_status !== "paid") fail("Confirm the order first.");
      const steps = ["pending", "accepted", "ready_for_pickup", "completed"];
      order.status = steps[Math.min(steps.indexOf(order.status) + 1, steps.length - 1)]; order.updatedAt = now();
      return copy(order);
    }
    if (method === "GET" && path === "/saved-shops") return shops.filter(s => saved.has(s._id)).map(s => ({ _id: `saved-${s._id}`, shop_id: copy(s) }));
    if (method === "POST" && path === "/saved-shops") {
      const shop = shops.find(s => s._id === body.shop_id); if (!shop) fail("Shop not found.", 404);
      saved.add(shop._id); return { _id: `saved-${shop._id}`, shop_id: copy(shop) };
    }
    if (method === "DELETE" && path.startsWith("/saved-shops/")) { saved.delete(path.split("/")[2]); return {}; }
    if (method === "GET" && path === "/notifications") return copy(notifications);
    if (method === "PATCH" && path.startsWith("/notifications/")) { notifications.forEach(n => { if (path.includes("read-all") || path.includes(n._id)) n.read = true; }); return {}; }
    if (method === "GET" && path === "/support/conversation") return { messages: copy(messages), conversation: { unread_by_customer: 0 }, has_more: false };
    if (method === "POST" && path === "/support/conversation/messages") {
      const text = String(body.text || "").trim(); if (!text) fail("Enter a message.");
      const message = { _id: `demo-message-${++sequence}`, sender_role: "customer", text, created_at: now(), order_context: body.order_context };
      messages.push(message); return copy(message);
    }
    if (method === "PATCH" && path === "/support/conversation/read") return {};
    fail("This action is currently unavailable.", 404);
  }
  return { request, addDocument };
}

export const demoStore = createDemoStore();
export async function demoAdapter(config) {
  const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  const data = await demoStore.request(config.method || "get", config.url, body, config.params);
  return { data, status: 200, statusText: "OK", headers: {}, config, request: null };
}
