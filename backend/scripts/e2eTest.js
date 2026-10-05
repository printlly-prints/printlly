#!/usr/bin/env node
/**
 * End-to-end test for the print marketplace backend.
 *
 * Exercises the full order lifecycle over real HTTP against an already-
 * running server (does NOT start one itself - run `npm run dev` first).
 * Google OAuth is intentionally not tested here (needs a real browser
 * consent screen); only local email/password auth is covered.
 *
 * Section 3 (run right after the shop is created, before anything else
 * touches it) covers vendor onboarding: photos, KYC, and admin
 * verification. It uploads real image bytes for owner_photo/shop_photo
 * and confirms they come back genuinely publicly fetchable; submits a
 * PDF id proof and confirms the response carries no trace of the file
 * (no URL, no public_id, nothing) and that what's actually stored in the
 * DB is a bare Cloudinary public_id rather than a URL, and that an
 * unsigned request for it 401s; provisions a one-off admin user directly
 * against the DB (there is no self-serve way to become admin, by design)
 * to drive PATCH /admin/shops/:id/verify through both a rejection and an
 * approval; and confirms GET /shops hides the shop entirely while
 * unapproved and, once approved, lists it with shop_photo_url but never
 * owner_photo_url/kyc/verification_status/rejection_reason. Every
 * section from here on inherits an already-approved shop, exactly as if
 * a real vendor had finished onboarding before taking orders.
 *
 * Section 5 also verifies automatic document deletion: completing an
 * order should delete its Upload record(s) and Cloudinary file(s), and a
 * REJECTED completion attempt (wrong OTP) should not. Checked via direct
 * DB/Cloudinary Admin API access, since there's no HTTP endpoint for
 * either - same as the CLEANUP section already does.
 *
 * Section 7 verifies the abandoned-order cron, which now has two
 * independent triggers. The print-workflow one: an order left pending is
 * backdated (its updatedAt pushed 49h into the past, bypassing Mongoose's
 * timestamps middleware via the raw driver collection - Model.updateOne
 * would just overwrite it back to "now") and the cron's exported function
 * is called directly rather than waiting for its real 15-minute schedule.
 * And the payment one: an order left unpaid (payment_status "created") is
 * backdated the same way and confirmed expired after 61 simulated
 * minutes, while a FAILED (not just unpaid) payment is confirmed to
 * survive the same sweep untouched, since it's still meant to be
 * retryable. It also confirms an expired order can't be paid for: both
 * create-order and verify (even with a valid signature for a Razorpay
 * order issued before it expired) are rejected, and it never becomes paid.
 *
 * Section 8 verifies itemized pricing (paper size / sides / add-on
 * services), now entirely per-shop: it confirms a freshly created shop's
 * pricing is prefilled from the global Settings document, that
 * GET/PATCH /shops/me/pricing validate rates (>= 0) and
 * sides_extra_rate (a flat amount per page, >= 0), that ordering a service the shop
 * hasn't enabled is rejected (never silently free), and that the actual
 * order math matches this shop's own vendor-set rates - not Settings -
 * except for platform_fee, which stays global. Also confirms injected
 * fake charges are still ignored with add-ons in the mix. Section 9
 * drives the Razorpay payment endpoints directly - real checkout can't be
 * scripted, so it manually computes the same HMAC signature the backend
 * does (using the real test RAZORPAY_KEY_SECRET) to exercise both a valid
 * and a deliberately wrong signature, plus the retry-after-failure path.
 *
 * Section 10 covers the live queue/rush indicator. The shared test shop
 * accumulates leftover orders from earlier sections over a run, so its
 * assertions are all relative (before/after a known change) rather than
 * absolute counts: it pays for two orders back to back at that shop and
 * checks the second order's queue_position is exactly one more than the
 * first's, and that GET /shops/:shopId/queue's active_orders_count grew
 * by exactly 2 - which holds regardless of whatever else is already
 * sitting in the queue from other sections. It also checks the endpoint
 * really is public (called with no token), that GET /shops' inline queue
 * info for this shop agrees with the standalone endpoint, and that
 * POST /payments/razorpay/verify's own success response already carries
 * the correct queue_position (matching what GET /orders/customer reports
 * for the same order) rather than requiring a refresh to see it.
 *
 * Section 11 covers saved/favourite shops end to end. Section 12 confirms
 * accepting an order creates an in-app notification.
 *
 * Section 13 covers POST /shops/compare-pricing. It registers and approves
 * two throwaway shops of its own (not the shared test shop used elsewhere)
 * with deliberately different pricing - a cheap one with lamination
 * enabled and an expensive one without - so one setup can exercise both
 * halves of the endpoint: requesting lamination excludes the shop that
 * doesn't offer it (checked by shop id membership in the results, not
 * array length, since the shared test shop and others may also be
 * eligible), and requesting no services (where both are eligible) puts
 * the cheap shop's total_amount ahead of the expensive one's, confirming
 * the ascending sort - checked by relative index, for the same reason.
 *
 * Section 14 covers is_open/business_hours - whether the shared test shop
 * is CURRENTLY accepting orders, separate from is_active/verification_status.
 * It manually closes the shop (PATCH /shops/me/status) and confirms
 * POST /orders is rejected with a clear "currently closed" message, then
 * reopens it and confirms an order succeeds again. It then enables an
 * automatic schedule window computed 2-3 hours from whatever the real
 * current IST time happens to be when the suite runs (never a fixed
 * clock, so this can't flake depending on time of day) while leaving
 * is_open itself true, and confirms an order is still rejected -
 * business_hours overriding a "true" manual toggle when outside the
 * window is the one direction explicitly called for. Also checks GET
 * /shops still lists the closed shop (closed shops are never hidden) with
 * is_currently_open false and neither raw field (is_open/business_hours)
 * leaking into the response. Finishes by disabling the schedule again so
 * the shared shop is back to its normal always-open state.
 *
 * Section 2 (vendorFlow) also confirms POST /shops rejects a second
 * registration attempt by the same owner with a 409, now that Shop.owner_id
 * is unique - one shop per owner.
 *
 * Section 15 confirms GET /pricing-config's repurposed shape: only
 * platform_fee_type/platform_fee_value, now that per-shop pricing has
 * made every other field it used to return stale.
 *
 * Section 16 covers is_active (shop deactivation) - a longer-term "off
 * the platform entirely" state, distinct from Section 14's is_open. Runs
 * against its own throwaway shop, never the shared one. Confirms a
 * deactivated shop disappears from GET /shops and POST /shops/
 * compare-pricing, that POST /orders rejects a new order to it, and -
 * without fully re-testing the whole order lifecycle - that an order
 * placed and paid for BEFORE deactivation is left completely alone: it's
 * still visible to the shop owner and can still be accepted normally.
 * Deactivation blocks new orders; it does not cancel what's already in
 * flight. Finishes by reactivating the throwaway shop before cleanup.
 *
 * Section 19 covers the customer support chat's REST half: a dedicated
 * customer's thread is created on first GET (and not duplicated on a
 * second), a message is sent and shows up in the admin inbox with
 * unread_by_admin 1 and the right preview, the admin's detail view
 * carries the customer profile and order history alongside the messages,
 * an admin reply increments unread_by_customer while leaving
 * unread_by_admin alone, and marking read from either side clears only
 * that side. It also confirms order_context resolves the shop name from
 * the order server-side rather than trusting the client, and that a
 * customer can't attach another customer's order. The Socket.io
 * transport is deliberately NOT tested here - see that section's comment,
 * and scripts/socketSupportProbe.mjs, which covers it without needing a
 * server or a database.
 *
 * Usage: node scripts/e2eTest.js
 *
 * All resources created (users, shop, uploads, orders, Cloudinary files)
 * are deleted again in the CLEANUP section, which always runs - even if
 * an earlier section throws - so the script never leaves test data behind.
 */

require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const Upload = require("../models/Upload");
const Settlement = require("../models/Settlement");
const PayoutHistory = require("../models/PayoutHistory");
const Notification = require("../models/Notification");
const Settings = require("../models/Settings");
const SavedShop = require("../models/SavedShop");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { cleanupAbandonedOrders } = require("../cron/cleanupAbandonedOrders");

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const STAMP = Date.now();

// Everything created over HTTP during the run, so CLEANUP can remove it
// regardless of where the script stopped.
const created = {
  userIds: [],
  shopId: null,
  orderIds: [],
  uploadIds: [],
  // Shops created outside the main shared shop above - currently just the
  // two throwaway ones for comparePricingAcrossShops (Section 13), which
  // needs its own shops with deliberately controlled rates rather than
  // whatever the shared shop's pricing happens to be at that point in the run.
  extraShopIds: [],
  // Every Cloudinary KYC asset this run uploads. A resubmission (see
  // Section 3) replaces shop.kyc.id_proof_url, so deleting only the
  // CURRENT one at cleanup would leak the earlier file.
  kycPublicIds: [],
};

// One result object per section, printed as the final summary.
const results = {
  customerFlow: { name: "1. CUSTOMER FLOW", pass: null, log: [] },
  vendorFlow: { name: "2. VENDOR FLOW", pass: null, log: [] },
  vendorOnboarding: { name: "3. VENDOR ONBOARDING (PHOTOS, KYC, ADMIN VERIFY)", pass: null, log: [] },
  uploadOrder: { name: "4. UPLOAD + ORDER CREATION", pass: null, log: [] },
  vendorOrderMgmt: { name: "5. VENDOR ORDER MANAGEMENT", pass: null, log: [] },
  customerHistory: { name: "6. CUSTOMER ORDER HISTORY", pass: null, log: [] },
  expiredCleanup: { name: "7. ABANDONED ORDER EXPIRY", pass: null, log: [] },
  itemizedPricing: { name: "8. ITEMIZED PRICING (ADD-ON SERVICES)", pass: null, log: [] },
  paymentVerification: { name: "9. RAZORPAY PAYMENT VERIFICATION", pass: null, log: [] },
  queueIndicator: { name: "10. QUEUE / RUSH INDICATOR", pass: null, log: [] },
  savedShops: { name: "11. SAVED SHOPS", pass: null, log: [] },
  notifications: { name: "12. NOTIFICATIONS", pass: null, log: [] },
  comparePricing: { name: "13. COMPARE PRICING ACROSS SHOPS", pass: null, log: [] },
  shopOpenStatus: { name: "14. SHOP OPEN/CLOSED STATUS", pass: null, log: [] },
  pricingConfig: { name: "15. PRICING CONFIG (PLATFORM FEE ONLY)", pass: null, log: [] },
  shopDeactivation: { name: "16. SHOP DEACTIVATION", pass: null, log: [] },
  adminPanel: { name: "17. ADMIN PANEL", pass: null, log: [] },
  shopLocation: { name: "18. SHOP LOCATION + AREA SEARCH", pass: null, log: [] },
  customerSupport: { name: "19. CUSTOMER SUPPORT CHAT (REST HALF)", pass: null, log: [] },
  payoutSettlements: { name: "20. PAYOUT DETAILS + MANUAL SETTLEMENTS", pass: null, log: [] },
  cleanup: { name: "21. CLEANUP", pass: null, log: [] },
};

function say(section, msg) {
  console.log(msg);
  results[section].log.push(msg);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Thin wrapper around fetch: sends JSON or FormData, always tries to
// parse a JSON response body (the API returns JSON even on errors).
async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let fetchBody;
  if (form) {
    fetchBody = form; // FormData - fetch sets the multipart boundary itself
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: fetchBody });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no/invalid JSON body - leave data as null */
  }
  return { status: res.status, data };
}

// Print settings live per document, so every order body carries a
// documents[] of { upload_id, color_mode, copies, paper_size, sides,
// services } rather than one shared set of fields (see
// utils/orderDocuments.js). `services` is an array of service NAMES as
// the target shop lists them - shop service lists are vendor-defined, so
// there are no fixed keys and no ids a customer could know in advance.
//
// Most tests here don't care about the distinction - they just need a
// valid order - so this applies ONE set of settings to every upload. The
// tests that genuinely exercise per-document differences (itemized
// pricing, and the compare-pricing section) build documents[] by hand.
function docs(uploadIds, settings = {}) {
  const ids = Array.isArray(uploadIds) ? uploadIds : [uploadIds];
  return ids.map((upload_id) => ({
    upload_id,
    color_mode: settings.color_mode || "bw",
    copies: settings.copies || 1,
    ...(settings.paper_size ? { paper_size: settings.paper_size } : {}),
    ...(settings.sides ? { sides: settings.sides } : {}),
    ...(settings.services ? { services: settings.services } : {}),
  }));
}

// makePhone below gives each caller ONE digit of namespace, so there are
// only ten distinct numbers per run and every caller has to claim a unique
// prefix by hand. This is the collision-proof alternative: a per-run
// counter in the last 3 digits, so any number of accounts can be created
// without coordinating prefixes. Still 10 digits.
let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return `${String(STAMP).slice(-7)}${String(phoneCounter).padStart(3, "0")}`;
}

function makePhone(prefix) {
  // 10 digits, unique per run: a fixed digit + the last 9 digits of STAMP.
  return `${prefix}${String(STAMP).slice(-9)}`;
}

// A minimal but structurally valid PDF with the given number of pages,
// a few hundred bytes.
function makeDummyPdfBuffer(pageCount = 1) {
  const pageObjNums = Array.from({ length: pageCount }, (_, i) => 3 + i);
  const kids = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  const pageObjs = pageObjNums
    .map((n) => `${n} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n`)
    .join("");
  const text =
    "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    `2 0 obj<</Type/Pages/Kids[${kids}]/Count ${pageCount}>>endobj\n` +
    pageObjs +
    "trailer<</Root 1 0 R>>\n%%EOF\n" +
    `% e2e test file - ${STAMP}\n`;
  return Buffer.from(text, "utf8");
}

// Uploads one or more dummy PDFs in a single multipart request (field
// name "documents", matching the multi-document upload API) and asserts
// the response shape: a "succeeded" array with one entry per file, each
// carrying a server-computed page_count.
async function uploadTestFiles(token, files) {
  const form = new FormData();
  for (const f of files) {
    const blob = new Blob([f.buffer], { type: "application/pdf" });
    form.append("documents", blob, f.filename);
  }

  const { status, data } = await api("POST", "/upload", { token, form });
  assert(status === 201, `expected 201 from POST /upload, got ${status}: ${JSON.stringify(data)}`);
  assert(Array.isArray(data.succeeded), "POST /upload did not return a succeeded array");
  assert(
    data.succeeded.length === files.length,
    `expected ${files.length} succeeded upload(s), got ${data.succeeded.length}: ${JSON.stringify(data)}`
  );

  for (const item of data.succeeded) {
    assert(item.upload_id, "a succeeded upload entry is missing upload_id");
    assert(item.file_url, "a succeeded upload entry is missing file_url");
    assert(typeof item.page_count === "number", "a succeeded upload entry is missing a numeric page_count");
    created.uploadIds.push(item.upload_id);
  }

  return data.succeeded;
}

// Manually computes the same HMAC-SHA256 signature
// controllers/paymentController.js recomputes on verify, using the real
// RAZORPAY_KEY_SECRET from .env - this is what stands in for Razorpay's
// checkout actually running (which needs a real browser).
function computeRazorpaySignature(razorpayOrderId, paymentId) {
  return crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest("hex");
}

// Drives an already-created order through both payment endpoints with a
// CORRECT signature and returns the verify response's data ({ success,
// otp, order }). Used wherever a section just needs a paid order to
// continue (sections 3-4) - the payment endpoints get their own dedicated,
// more thorough test in Section 8 (including the wrong-signature path).
async function payForOrder(customerToken, orderId) {
  const create = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: orderId },
  });
  assert(
    create.status === 200,
    `expected 200 from POST /payments/razorpay/create-order, got ${create.status}: ${JSON.stringify(create.data)}`
  );
  assert(create.data.razorpay_order_id, "create-order response is missing razorpay_order_id");

  const fakePaymentId = `pay_e2e_${STAMP}_${Math.random().toString(36).slice(2, 10)}`;
  const signature = computeRazorpaySignature(create.data.razorpay_order_id, fakePaymentId);

  const verify = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: orderId,
      razorpay_order_id: create.data.razorpay_order_id,
      razorpay_payment_id: fakePaymentId,
      razorpay_signature: signature,
    },
  });
  assert(
    verify.status === 200,
    `expected 200 from POST /payments/razorpay/verify, got ${verify.status}: ${JSON.stringify(verify.data)}`
  );
  assert(verify.data.success === true, `expected success true, got ${JSON.stringify(verify.data)}`);
  assert(
    typeof verify.data.otp === "string" && /^\d{6}$/.test(verify.data.otp),
    `expected a 6-digit otp, got "${verify.data.otp}"`
  );

  return verify.data;
}

// --- Section 1: customer flow -------------------------------------------

async function customerFlow() {
  const section = "customerFlow";
  const email = `test.customer.${STAMP}@example.com`;
  const phone = makePhone("9");
  const password = "TestPass123!";

  say(section, `Registering customer ${email} / ${phone}`);
  const reg = await api("POST", "/auth/register", {
    body: { name: "E2E Test Customer", phone, email, password, role: "customer" },
  });
  assert(reg.status === 201, `register expected 201, got ${reg.status}: ${JSON.stringify(reg.data)}`);
  assert(reg.data.token, "register did not return a token");
  assert(reg.data.user?.id, "register did not return user.id");
  created.userIds.push(reg.data.user.id);
  say(section, `  -> registered, user id ${reg.data.user.id}`);

  // One phone number and one email address belong to one person - the
  // same pair must not be registrable again under ANY role. Checked for
  // each field separately, because the message names which one clashed.
  say(section, "Re-registering the same email under a different phone - expect 409");
  const dupEmail = await api("POST", "/auth/register", {
    body: { name: "E2E Dup Email", phone: uniquePhone(), email, password, role: "customer" },
  });
  assert(dupEmail.status === 409, `expected 409, got ${dupEmail.status}: ${JSON.stringify(dupEmail.data)}`);
  assert(
    /email/i.test(dupEmail.data.message || ""),
    `expected the message to name the email, got ${JSON.stringify(dupEmail.data.message)}`
  );

  say(section, "Re-registering the same phone under a different email, as a VENDOR - expect 409");
  const dupPhone = await api("POST", "/auth/register", {
    body: {
      name: "E2E Dup Phone",
      phone,
      email: `e2e.dup.phone.${STAMP}@example.com`,
      password,
      role: "shop_owner",
    },
  });
  assert(dupPhone.status === 409, `expected 409, got ${dupPhone.status}: ${JSON.stringify(dupPhone.data)}`);
  assert(
    /phone/i.test(dupPhone.data.message || ""),
    `expected the message to name the phone, got ${JSON.stringify(dupPhone.data.message)}`
  );

  // Casing and padding are normalised by the schema on save, so they have
  // to be normalised on the lookup too - otherwise "SAME@X.com" slips past
  // the check and only fails later on the unique index.
  say(section, "Re-registering the same email in UPPERCASE with a padded phone - expect 409");
  const dupNormalised = await api("POST", "/auth/register", {
    body: {
      name: "E2E Dup Normalised",
      phone: `  ${phone}  `,
      email: email.toUpperCase(),
      password,
      role: "customer",
    },
  });
  assert(
    dupNormalised.status === 409,
    `expected 409 for a case/whitespace variant, got ${dupNormalised.status}: ${JSON.stringify(dupNormalised.data)}`
  );

  // The pre-check is not a lock: simultaneous registrations all pass it and
  // the unique index is what actually stops the duplicate. That must read
  // as a 409 like any other duplicate, never a 500.
  say(section, "Six simultaneous registrations of one new email/phone - expect exactly one 201, the rest 409");
  const raceEmail = `e2e.race.${STAMP}@example.com`;
  const racePhone = uniquePhone();
  const raceResults = await Promise.all(
    Array.from({ length: 6 }, () =>
      api("POST", "/auth/register", {
        body: { name: "E2E Race", phone: racePhone, email: raceEmail, password, role: "customer" },
      })
    )
  );
  const created201 = raceResults.filter((r) => r.status === 201);
  const rejected409 = raceResults.filter((r) => r.status === 409);
  assert(
    created201.length === 1,
    `expected exactly one account to be created, got ${created201.length}: ${JSON.stringify(raceResults.map((r) => r.status))}`
  );
  assert(
    rejected409.length === 5,
    `expected the other five to be 409 (never 500), got ${JSON.stringify(raceResults.map((r) => r.status))}`
  );
  created.userIds.push(created201[0].data.user.id);
  say(section, "  -> confirmed: one account created, five rejected with 409, no 500s");

  say(section, "Logging in with the same credentials");
  const login = await api("POST", "/auth/login", { body: { email, password } });
  assert(login.status === 200, `login expected 200, got ${login.status}: ${JSON.stringify(login.data)}`);
  assert(login.data.token, "login did not return a token");
  say(section, "  -> login OK, JWT received");

  say(section, "Fetching GET /shops with the customer JWT");
  const shops = await api("GET", "/shops", { token: login.data.token });
  assert(shops.status === 200, `GET /shops expected 200, got ${shops.status}`);
  assert(Array.isArray(shops.data), "GET /shops did not return an array");
  if (shops.data.length === 0) {
    say(section, "  -> no active shops exist yet (expected on a clean DB) - the vendor flow below will create one");
  } else {
    say(section, `  -> ${shops.data.length} active shop(s) already exist`);
  }

  return { customerToken: login.data.token, customerId: reg.data.user.id };
}

// --- Section 2: vendor flow ----------------------------------------------

async function vendorFlow() {
  const section = "vendorFlow";
  const email = `test.vendor.${STAMP}@example.com`;
  const phone = makePhone("8");
  const password = "TestPass123!";

  say(section, `Registering shop owner ${email} / ${phone}`);
  const reg = await api("POST", "/auth/register", {
    body: { name: "E2E Test Vendor", phone, email, password, role: "shop_owner" },
  });
  assert(reg.status === 201, `register expected 201, got ${reg.status}: ${JSON.stringify(reg.data)}`);
  created.userIds.push(reg.data.user.id);
  say(section, `  -> registered, user id ${reg.data.user.id}`);

  say(section, "Logging in as vendor");
  const login = await api("POST", "/auth/login", { body: { email, password } });
  assert(login.status === 200, `login expected 200, got ${login.status}`);
  const vendorToken = login.data.token;
  say(section, "  -> login OK, JWT received");

  say(section, "GET /shops/me before registering a shop (expect 404)");
  const before = await api("GET", "/shops/me", { token: vendorToken });
  assert(before.status === 404, `expected 404, got ${before.status}: ${JSON.stringify(before.data)}`);
  say(section, `  -> confirmed 404: "${before.data?.message}"`);

  const shopName = `Test Print Shop ${STAMP}`;
  say(section, `POST /shops to register "${shopName}"`);
  const createShop = await api("POST", "/shops", {
    token: vendorToken,
    body: { shop_name: shopName, address: "1 E2E Test Lane, Test City", contact: makePhone("7") },
  });
  assert(createShop.status === 201, `expected 201, got ${createShop.status}: ${JSON.stringify(createShop.data)}`);
  assert(createShop.data._id, "created shop has no _id");
  created.shopId = createShop.data._id;
  say(section, `  -> shop created, id ${created.shopId}`);

  say(section, "GET /shops/me after registering (expect the shop back)");
  const after = await api("GET", "/shops/me", { token: vendorToken });
  assert(after.status === 200, `expected 200, got ${after.status}: ${JSON.stringify(after.data)}`);
  assert(after.data._id === created.shopId, "GET /shops/me returned a different shop id");
  assert(
    after.data.verification_status === "pending",
    `expected a freshly created shop to default to verification_status "pending", got "${after.data.verification_status}"`
  );
  say(section, `  -> confirmed: GET /shops/me now returns shop ${after.data._id}, verification_status "pending"`);

  say(section, "POST /shops again for the same owner - expect 409 (one shop per owner)");
  const duplicateAttempt = await api("POST", "/shops", {
    token: vendorToken,
    body: { shop_name: "Should Not Be Created", address: "2 E2E Test Lane, Test City", contact: makePhone("6") },
  });
  assert(
    duplicateAttempt.status === 409,
    `expected 409, got ${duplicateAttempt.status}: ${JSON.stringify(duplicateAttempt.data)}`
  );
  say(section, `  -> rejected as expected: "${duplicateAttempt.data.message}"`);

  return { vendorToken, shopId: created.shopId };
}

// --- Section 3: vendor onboarding (photos, KYC, admin verify) --------------
//
// Runs immediately after the shop is created and before anything else
// touches it, so every later section inherits an already-approved shop -
// exactly like a real vendor would have finished onboarding before ever
// taking an order. This is also the only section that exercises GET
// /shops' new approved-only filter directly (queueIndicator, later,
// depends on this shop already being listed there).

const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function vendorOnboarding(vendorToken, shopId) {
  const section = "vendorOnboarding";

  say(section, "POST /shops/me/photos with owner_photo + shop_photo (real PNG bytes)");
  const png = Buffer.from(PNG_1PX_BASE64, "base64");
  const photoForm = new FormData();
  photoForm.append("owner_photo", new Blob([png], { type: "image/png" }), `owner-${STAMP}.png`);
  photoForm.append("shop_photo", new Blob([png], { type: "image/png" }), `shop-${STAMP}.png`);
  const photos = await api("POST", "/shops/me/photos", { token: vendorToken, form: photoForm });
  assert(photos.status === 200, `expected 200, got ${photos.status}: ${JSON.stringify(photos.data)}`);
  assert(
    typeof photos.data.owner_photo_url === "string" && photos.data.owner_photo_url.startsWith("http"),
    `expected a real owner_photo_url, got ${JSON.stringify(photos.data.owner_photo_url)}`
  );
  assert(
    typeof photos.data.shop_photo_url === "string" && photos.data.shop_photo_url.startsWith("http"),
    `expected a real shop_photo_url, got ${JSON.stringify(photos.data.shop_photo_url)}`
  );
  say(section, `  -> uploaded owner_photo_url and shop_photo_url`);

  say(section, "Fetching the returned shop_photo_url directly - confirming it's genuinely public");
  const photoFetch = await fetch(photos.data.shop_photo_url);
  assert(photoFetch.status === 200, `expected the public shop photo URL to be fetchable, got ${photoFetch.status}`);
  say(section, "  -> confirmed: publicly fetchable, as intended for a customer-facing photo");

  say(section, "POST /shops/me/kyc with id_proof_type 'aadhaar' and a PDF id proof");
  const kycForm = new FormData();
  kycForm.append("id_proof_type", "aadhaar");
  kycForm.append("gst_number", "22AAAAA0000A1Z5");
  kycForm.append(
    "id_proof",
    new Blob([makeDummyPdfBuffer(1)], { type: "application/pdf" }),
    `id-proof-${STAMP}.pdf`
  );
  const kyc = await api("POST", "/shops/me/kyc", { token: vendorToken, form: kycForm });
  assert(kyc.status === 200, `expected 200, got ${kyc.status}: ${JSON.stringify(kyc.data)}`);
  assert(
    kyc.data.verification_status === "pending",
    `expected verification_status "pending" right after submitting KYC, got "${kyc.data.verification_status}"`
  );
  // The whole point of this endpoint: the response must carry NOTHING
  // that identifies or locates the uploaded file - no URL, no public_id,
  // nothing at all, to any client, including the vendor's own app that
  // just uploaded it.
  assert(kyc.data.id_proof_url === undefined, "KYC response must never include id_proof_url");
  assert(
    JSON.stringify(kyc.data).toLowerCase().indexOf("cloudinary") === -1,
    `KYC response must never mention the file's storage location, got ${JSON.stringify(kyc.data)}`
  );
  say(section, "  -> KYC submitted, response carries no file reference at all");

  say(section, "POST /shops/me/kyc AGAIN while still pending - expect 400 (no stacking up resubmissions)");
  const dupKycForm = new FormData();
  dupKycForm.append("id_proof_type", "pan");
  dupKycForm.append(
    "id_proof",
    new Blob([makeDummyPdfBuffer(1)], { type: "application/pdf" }),
    `id-proof-dup-${STAMP}.pdf`
  );
  const dupKyc = await api("POST", "/shops/me/kyc", { token: vendorToken, form: dupKycForm });
  assert(dupKyc.status === 400, `expected 400, got ${dupKyc.status}: ${JSON.stringify(dupKyc.data)}`);
  assert(
    /under review/i.test(dupKyc.data?.message || ""),
    `expected an "under review" message, got ${JSON.stringify(dupKyc.data)}`
  );
  say(section, `  -> rejected: "${dupKyc.data.message}"`);

  say(section, "Direct DB read - confirming what's actually stored is a public_id, never a working URL");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const shopDoc = await Shop.findById(shopId);
  assert(shopDoc.kyc?.id_proof_url, "expected shop.kyc.id_proof_url to be set in the DB");
  assert(
    !shopDoc.kyc.id_proof_url.startsWith("http"),
    `expected a bare Cloudinary public_id, got what looks like a URL: "${shopDoc.kyc.id_proof_url}"`
  );
  assert(
    shopDoc.kyc.id_proof_resource_type === "raw",
    `expected resource_type "raw" for a PDF id proof, got "${shopDoc.kyc.id_proof_resource_type}"`
  );
  created.kycPublicIds.push(shopDoc.kyc.id_proof_url);
  say(section, `  -> confirmed: kyc.id_proof_url is a public_id ("${shopDoc.kyc.id_proof_url}"), not a URL`);

  say(section, "Confirming the uploaded id proof is NOT accessible without a signature (unsigned request)");
  const guessedKycUrl = cloudinary.url(shopDoc.kyc.id_proof_url, {
    resource_type: shopDoc.kyc.id_proof_resource_type,
    type: "authenticated",
    secure: true,
  });
  const guessedKycFetch = await fetch(guessedKycUrl);
  assert(
    guessedKycFetch.status === 401,
    `expected 401 (not publicly accessible) for an unsigned request, got ${guessedKycFetch.status}`
  );
  say(section, "  -> confirmed: 401 without a signature - the id proof is genuinely private");

  say(section, "GET /shops (customer-facing) - this shop must NOT appear yet, still unapproved");
  const beforeApproval = await api("GET", "/shops", { token: vendorToken });
  assert(beforeApproval.status === 200, `expected 200, got ${beforeApproval.status}`);
  assert(
    !beforeApproval.data.some((s) => s._id === shopId),
    "an unapproved shop must not appear in GET /shops"
  );
  say(section, "  -> confirmed: hidden from the customer-facing listing while pending");

  say(section, "PATCH /admin/shops/:id/verify AS THE VENDOR (not an admin) - expect 403");
  const forbiddenVerify = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: vendorToken,
    body: { status: "approved" },
  });
  assert(forbiddenVerify.status === 403, `expected 403, got ${forbiddenVerify.status}: ${JSON.stringify(forbiddenVerify.data)}`);
  say(section, `  -> correctly rejected: "${forbiddenVerify.data?.message}"`);

  say(section, "Provisioning a one-off admin user directly against the DB (no self-serve admin signup exists, by design)");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const adminUser = await User.create({
    name: "E2E Test Admin",
    phone: makePhone("6"),
    email: `test.admin.${STAMP}@example.com`,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  // Same shape as authController.js's generateToken - this is what a real
  // admin login would produce, just signed locally since there's no
  // admin login flow to call.
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  say(section, `  -> admin user ${adminUser._id} provisioned`);

  say(section, "PATCH /admin/shops/:id/verify with status 'rejected' (exercising the reject path first)");
  const rejected = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: adminToken,
    body: { status: "rejected", rejection_reason: "Documents unclear, please resubmit." },
  });
  assert(rejected.status === 200, `expected 200, got ${rejected.status}: ${JSON.stringify(rejected.data)}`);
  assert(
    rejected.data.verification_status === "rejected",
    `expected "rejected", got "${rejected.data.verification_status}"`
  );
  assert(
    rejected.data.rejection_reason === "Documents unclear, please resubmit.",
    `rejection_reason not saved/returned correctly, got ${JSON.stringify(rejected.data.rejection_reason)}`
  );
  assert(
    rejected.data.kyc?.id_proof_url === undefined,
    "the verify response must never include the KYC file reference either"
  );
  say(section, "  -> confirmed: rejected with reason, no file reference leaked in the admin response");

  say(section, "GET /shops/me as the vendor - confirming the rejection and reason are visible to them");
  const afterReject = await api("GET", "/shops/me", { token: vendorToken });
  assert(afterReject.status === 200, `expected 200, got ${afterReject.status}`);
  assert(afterReject.data.verification_status === "rejected", "vendor should see verification_status 'rejected'");
  assert(
    afterReject.data.rejection_reason === "Documents unclear, please resubmit.",
    "vendor should see the rejection_reason"
  );
  say(section, `  -> vendor sees: "Rejected: ${afterReject.data.rejection_reason}"`);

  say(section, "Resubmitting KYC after the rejection, deliberately WITHOUT a GST number (it is optional)");
  const resubmitForm = new FormData();
  resubmitForm.append("id_proof_type", "aadhaar");
  resubmitForm.append(
    "id_proof",
    new Blob([makeDummyPdfBuffer(1)], { type: "application/pdf" }),
    `id-proof-resubmit-${STAMP}.pdf`
  );
  const resubmit = await api("POST", "/shops/me/kyc", { token: vendorToken, form: resubmitForm });
  assert(resubmit.status === 200, `a rejected shop must be able to resubmit, got ${resubmit.status}: ${JSON.stringify(resubmit.data)}`);
  assert(
    resubmit.data.verification_status === "pending",
    `expected "pending" after resubmission, got "${resubmit.data.verification_status}"`
  );
  const afterResubmitDoc = await Shop.findById(shopId);
  assert(
    !afterResubmitDoc.kyc.gst_number,
    `a KYC submitted with no GST number must store none, got ${JSON.stringify(afterResubmitDoc.kyc.gst_number)}`
  );
  assert(
    afterResubmitDoc.kyc.id_proof_url.toLowerCase().endsWith(".pdf"),
    `a PDF id proof must be stored with a .pdf public_id (Cloudinary serves raw assets by extension), got "${afterResubmitDoc.kyc.id_proof_url}"`
  );
  created.kycPublicIds.push(afterResubmitDoc.kyc.id_proof_url);
  say(section, "  -> resubmission accepted with no GST, stored as a .pdf public_id, back to pending");

  say(section, "PATCH /admin/shops/:id/verify with status 'approved'");
  const approved = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: adminToken,
    body: { status: "approved" },
  });
  assert(approved.status === 200, `expected 200, got ${approved.status}: ${JSON.stringify(approved.data)}`);
  assert(
    approved.data.verification_status === "approved",
    `expected "approved", got "${approved.data.verification_status}"`
  );
  assert(
    approved.data.rejection_reason === null,
    `expected rejection_reason cleared to null on approval, got ${JSON.stringify(approved.data.rejection_reason)}`
  );
  say(section, "  -> confirmed: approved, previous rejection_reason cleared");

  say(section, "POST /shops/me/kyc once APPROVED - expect 400 (verified shops don't resubmit)");
  const approvedKycForm = new FormData();
  approvedKycForm.append("id_proof_type", "aadhaar");
  approvedKycForm.append(
    "id_proof",
    new Blob([makeDummyPdfBuffer(1)], { type: "application/pdf" }),
    `id-proof-approved-${STAMP}.pdf`
  );
  const approvedKyc = await api("POST", "/shops/me/kyc", { token: vendorToken, form: approvedKycForm });
  assert(approvedKyc.status === 400, `expected 400, got ${approvedKyc.status}: ${JSON.stringify(approvedKyc.data)}`);
  assert(
    /already verified/i.test(approvedKyc.data?.message || ""),
    `expected an "already verified" message, got ${JSON.stringify(approvedKyc.data)}`
  );
  say(section, `  -> rejected: "${approvedKyc.data.message}"`);

  say(section, "GET /shops (customer-facing) - the shop should now appear, with shop_photo_url but nothing sensitive");
  const afterApproval = await api("GET", "/shops", { token: vendorToken });
  assert(afterApproval.status === 200, `expected 200, got ${afterApproval.status}`);
  const listed = afterApproval.data.find((s) => s._id === shopId);
  assert(listed, "expected the newly-approved shop to appear in GET /shops");
  assert(
    listed.shop_photo_url === photos.data.shop_photo_url,
    "expected shop_photo_url to be present in GET /shops and match what was uploaded"
  );
  assert(listed.owner_photo_url === undefined, "GET /shops must never include owner_photo_url");
  assert(listed.kyc === undefined, "GET /shops must never include kyc");
  assert(listed.verification_status === undefined, "GET /shops must never include verification_status");
  assert(listed.rejection_reason === undefined, "GET /shops must never include rejection_reason");
  say(section, "  -> confirmed: now listed, carries shop_photo_url only - no owner_photo_url/kyc/verification internals");
}

// --- Section 4: upload + order creation (as customer) --------------------

async function uploadAndCreateOrder(customerToken, shopId) {
  const section = "uploadOrder";

  say(section, "Uploading 2 dummy test PDFs (1-page and 3-page) as the customer");
  const uploads = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-a.pdf` },
    { buffer: makeDummyPdfBuffer(3), filename: `e2e-test-${STAMP}-b.pdf` },
  ]);
  uploads.forEach((u, i) =>
    say(
      section,
      `  -> uploaded doc ${i + 1}: upload_id ${u.upload_id}, page_count ${u.page_count}, file_url ${u.file_url}`
    )
  );

  say(section, "Creating an order against the test shop with both documents");
  const order = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs(uploads.map((u) => u.upload_id), { color_mode: "bw", copies: 1 }),
      instructions: `E2E test order ${STAMP} - please ignore`,
    },
  });
  assert(order.status === 201, `expected 201, got ${order.status}: ${JSON.stringify(order.data)}`);
  assert(order.data._id, "order response has no _id");
  assert(order.data.status === "pending", `expected status "pending", got "${order.data.status}"`);
  created.orderIds.push(order.data._id);

  // otp is no longer generated at order creation - only a verified
  // payment produces one (see Section 8). payment_status starts
  // "created" until then.
  assert(!order.data.otp, `expected no otp at order creation, got "${order.data.otp}"`);
  assert(
    order.data.payment_status === "created",
    `expected payment_status "created" at order creation, got "${order.data.payment_status}"`
  );
  say(section, "  -> confirmed: no otp yet, payment_status is \"created\"");

  // Pricing breakdown - base_subtotal (renamed from the old plain
  // "subtotal" now that paper size/sides/services add-ons exist too).
  // This order uses none of those add-ons, so they should all be zero.
  assert(typeof order.data.base_subtotal === "number", "order response is missing a numeric base_subtotal");
  assert(typeof order.data.platform_fee === "number", "order response is missing a numeric platform_fee");
  assert(typeof order.data.total_amount === "number", "order response is missing a numeric total_amount");
  assert(order.data.paper_size_charge === 0, `expected paper_size_charge 0 for a plain A4 order, got ${order.data.paper_size_charge}`);
  assert(order.data.sides_charge === 0, `expected sides_charge 0 for a single-sided order, got ${order.data.sides_charge}`);
  assert(order.data.services_charge === 0, `expected services_charge 0 with no add-ons selected, got ${order.data.services_charge}`);
  assert(
    order.data.total_amount === order.data.base_subtotal + order.data.platform_fee,
    `total_amount (${order.data.total_amount}) !== base_subtotal (${order.data.base_subtotal}) + platform_fee (${order.data.platform_fee})`
  );
  say(
    section,
    `  -> pricing OK: base_subtotal ${order.data.base_subtotal} + platform_fee ${order.data.platform_fee} = total_amount ${order.data.total_amount}`
  );

  // documents[] must have one entry per uploaded file, in the same order,
  // each carrying the exact page_count the upload step already reported.
  assert(
    Array.isArray(order.data.documents) && order.data.documents.length === uploads.length,
    `expected order.documents to have ${uploads.length} entries, got ${JSON.stringify(order.data.documents)}`
  );
  uploads.forEach((u, i) => {
    const doc = order.data.documents[i];
    assert(doc, `order.documents[${i}] is missing`);
    assert(
      doc.page_count === u.page_count,
      `order.documents[${i}].page_count (${doc.page_count}) does not match upload ${i + 1}'s page_count (${u.page_count})`
    );
  });
  say(
    section,
    `  -> order created: id ${order.data._id}, status ${order.data.status}, ${order.data.documents.length} document(s) with matching page counts`
  );

  say(section, "Paying for the order (POST /payments/razorpay/create-order + verify with a correct signature)");
  const payment = await payForOrder(customerToken, order.data._id);
  assert(
    payment.order.payment_status === "paid",
    `expected payment_status "paid" after verification, got "${payment.order.payment_status}"`
  );
  say(section, `  -> paid OK: payment_status "paid", otp ${payment.otp}`);

  return { orderId: order.data._id, otp: payment.otp, uploads };
}

// --- Section 5: vendor order management -----------------------------------

async function vendorOrderManagement(vendorToken, customerToken, shopId, orderId, otp, uploads) {
  const section = "vendorOrderMgmt";

  // Needed below to verify the Upload record + Cloudinary file are really
  // gone after completion - there's no HTTP endpoint for either check, so
  // this is direct DB/Cloudinary access, same as the cleanup section.
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  // Capture each upload's public_id now, while the record still exists.
  // Completing the order below deletes it, and POST /upload never exposes
  // public_id to clients in the first place.
  const publicIdByUploadId = {};
  for (const u of uploads) {
    const uploadDoc = await Upload.findById(u.upload_id);
    assert(uploadDoc, `expected Upload record ${u.upload_id} to exist before completion`);
    publicIdByUploadId[u.upload_id] = uploadDoc.public_id;
  }

  say(section, `GET /orders/shop/${shopId} - checking the new order is listed as pending`);
  const list = await api("GET", `/orders/shop/${shopId}`, { token: vendorToken });
  assert(list.status === 200, `expected 200, got ${list.status}`);
  const listed = list.data.find((o) => o._id === orderId);
  assert(listed, `order ${orderId} not found in shop order list`);
  assert(listed.status === "pending", `expected "pending", got "${listed.status}"`);
  assert(
    listed.payment_status === "paid",
    `expected the vendor's list to only ever show paid orders, got payment_status "${listed.payment_status}"`
  );
  say(section, "  -> confirmed order appears with status pending and payment_status paid");

  // GET /orders/:id/documents/:index/view - what the vendor dashboard's
  // document viewer fetches. The dashboard no longer links to the raw
  // Cloudinary URL (view-and-print only, no download affordance), so this
  // route is now the vendor's only path to the file and has to actually
  // return the PDF, inline, and only to the right people.
  say(section, `GET /orders/${orderId}/documents/0/view - vendor fetching the document through the API`);
  // Raw fetch, not api(): the body is a PDF, not JSON.
  const docView = await fetch(`${BASE_URL}/orders/${orderId}/documents/0/view`, {
    headers: { Authorization: `Bearer ${vendorToken}` },
  });
  assert(docView.status === 200, `expected 200, got ${docView.status}`);
  assert(
    (docView.headers.get("content-type") || "").includes("application/pdf"),
    `expected application/pdf, got "${docView.headers.get("content-type")}"`
  );
  // Inline, and with no filename= - nothing in this response offers a save.
  const disposition = docView.headers.get("content-disposition") || "";
  assert(
    disposition.includes("inline") && !disposition.includes("filename"),
    `expected an inline Content-Disposition with no filename, got "${disposition}"`
  );
  const docBytes = Buffer.from(await docView.arrayBuffer());
  assert(
    docBytes.subarray(0, 5).toString() === "%PDF-",
    `expected real PDF bytes, got ${JSON.stringify(docBytes.subarray(0, 8).toString())}`
  );
  say(section, `  -> served ${docBytes.length} bytes of inline application/pdf`);

  // The Cloudinary URL itself is unauthenticated, so this route's own
  // ownership check is what actually scopes the file to this shop.
  say(section, "Confirming another vendor cannot fetch the same document");
  // A bare second account is enough - the route's check is "do you own
  // the shop this order was placed at", so no second shop is needed.
  const outsiderReg = await api("POST", "/auth/register", {
    body: {
      name: "E2E Outsider Vendor",
      phone: uniquePhone(),
      email: `test.outsider.${STAMP}@example.com`,
      password: "TestPass123!",
      role: "shop_owner",
    },
  });
  assert(outsiderReg.status === 201, `outsider register expected 201, got ${outsiderReg.status}`);
  created.userIds.push(outsiderReg.data.user.id);
  const foreignView = await fetch(`${BASE_URL}/orders/${orderId}/documents/0/view`, {
    headers: { Authorization: `Bearer ${outsiderReg.data.token}` },
  });
  assert(foreignView.status === 403, `expected 403 for a vendor who doesn't own the order, got ${foreignView.status}`);

  say(section, "Confirming an out-of-range document index is rejected");
  const badIndex = await api("GET", `/orders/${orderId}/documents/9/view`, { token: vendorToken });
  assert(badIndex.status === 404, `expected 404, got ${badIndex.status}: ${JSON.stringify(badIndex.data)}`);
  say(section, "  -> confirmed: 403 for another vendor, 404 for a document that doesn't exist");

  say(section, `PATCH /orders/${orderId}/accept`);
  const accept = await api("PATCH", `/orders/${orderId}/accept`, { token: vendorToken });
  assert(accept.status === 200, `expected 200, got ${accept.status}: ${JSON.stringify(accept.data)}`);
  assert(accept.data.status === "accepted", `expected "accepted", got "${accept.data.status}"`);
  say(section, "  -> status is now accepted");

  say(section, `PATCH /orders/${orderId}/ready`);
  const ready = await api("PATCH", `/orders/${orderId}/ready`, { token: vendorToken });
  assert(ready.status === 200, `expected 200, got ${ready.status}: ${JSON.stringify(ready.data)}`);
  assert(ready.data.status === "ready_for_pickup", `expected "ready_for_pickup", got "${ready.data.status}"`);
  say(section, "  -> status is now ready_for_pickup");

  say(section, `PATCH /orders/${orderId}/complete with the correct OTP`);
  const complete = await api("PATCH", `/orders/${orderId}/complete`, { token: vendorToken, body: { otp } });
  assert(complete.status === 200, `expected 200, got ${complete.status}: ${JSON.stringify(complete.data)}`);
  assert(complete.data.status === "completed", `expected "completed", got "${complete.data.status}"`);
  say(section, "  -> status is now completed");

  // Document deletion check - the whole point of this pass. Completing
  // the order above should have deleted each Upload record and its
  // Cloudinary file. Checked via Cloudinary's Admin API (the origin),
  // not the public delivery URL: Cloudinary's CDN can keep serving a
  // deleted "raw" resource from edge cache for a while after deletion,
  // so a plain HTTP fetch of file_url is not a reliable signal here -
  // confirmed by hand against this exact project's Cloudinary account
  // before writing this check this way.
  say(section, "Verifying uploaded documents were deleted after completion");
  for (const u of uploads) {
    const stillExists = await Upload.findById(u.upload_id);
    assert(
      !stillExists,
      `expected Upload record ${u.upload_id} to be deleted after order completion, but it still exists`
    );

    const publicId = publicIdByUploadId[u.upload_id];
    let cloudinaryDeleted = false;
    try {
      await cloudinary.api.resource(publicId, { resource_type: "raw" });
    } catch (err) {
      cloudinaryDeleted = err.error?.http_code === 404;
      if (!cloudinaryDeleted) {
        throw new Error(
          `expected a 404 "not found" from Cloudinary for ${publicId}, got: ${
            err.error ? JSON.stringify(err.error) : err.message
          }`
        );
      }
    }
    assert(cloudinaryDeleted, `expected Cloudinary resource ${publicId} to be deleted, but it still exists`);
  }
  say(section, `  -> confirmed: ${uploads.length} Upload record(s) and Cloudinary file(s) deleted`);

  // Second order, purely to exercise the wrong-OTP rejection path.
  say(section, "Creating a second test order to verify wrong-OTP rejection");
  const [upload2] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-wrongotp.pdf` },
  ]);
  const order2 = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload2.upload_id], { color_mode: "color", copies: 2 }),
      instructions: `E2E wrong-otp test order ${STAMP}`,
    },
  });
  assert(order2.status === 201, `expected 201, got ${order2.status}: ${JSON.stringify(order2.data)}`);
  created.orderIds.push(order2.data._id);
  const order2Id = order2.data._id;
  say(section, `  -> second order created: id ${order2Id}`);

  say(section, "Paying for the second order so it has a real otp to test a wrong guess against");
  const payment2 = await payForOrder(customerToken, order2Id);
  const realOtp2 = payment2.otp;
  say(section, `  -> paid OK, real otp is ${realOtp2}`);

  await api("PATCH", `/orders/${order2Id}/accept`, { token: vendorToken });
  const ready2 = await api("PATCH", `/orders/${order2Id}/ready`, { token: vendorToken });
  assert(ready2.status === 200 && ready2.data.status === "ready_for_pickup", "could not advance second order to ready_for_pickup");
  say(section, "  -> second order advanced to ready_for_pickup");

  const wrongOtp = realOtp2 === "000000" ? "111111" : "000000"; // guaranteed mismatch
  say(section, `Attempting PATCH /orders/${order2Id}/complete with a deliberately wrong OTP`);
  const badComplete = await api("PATCH", `/orders/${order2Id}/complete`, {
    token: vendorToken,
    body: { otp: wrongOtp },
  });
  assert(badComplete.status === 400, `expected 400 for wrong OTP, got ${badComplete.status}: ${JSON.stringify(badComplete.data)}`);
  say(section, `  -> correctly rejected: "${badComplete.data?.message}"`);

  // Confirm it genuinely did NOT complete.
  const recheck = await api("GET", `/orders/shop/${shopId}`, { token: vendorToken });
  const stillReady = recheck.data.find((o) => o._id === order2Id);
  assert(stillReady?.status === "ready_for_pickup", `expected second order to remain "ready_for_pickup", got "${stillReady?.status}"`);
  say(section, "  -> confirmed order status is unchanged (still ready_for_pickup, not completed)");

  // Negative control: a rejected completion attempt must not trigger
  // document deletion - only a genuinely successful one should.
  const upload2StillExists = await Upload.findById(upload2.upload_id);
  assert(
    upload2StillExists,
    `expected Upload record ${upload2.upload_id} to survive a REJECTED completion attempt, but it was deleted`
  );
  say(section, "  -> confirmed the rejected order's Upload record was NOT deleted");
}

// --- Section 6: customer order history ------------------------------------

async function customerOrderHistory(customerToken, orderId) {
  const section = "customerHistory";

  say(section, "GET /orders/customer - checking the completed test order appears");
  const res = await api("GET", "/orders/customer", { token: customerToken });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const found = res.data.find((o) => o._id === orderId);
  assert(found, `order ${orderId} not found in customer's order history`);
  assert(found.status === "completed", `expected "completed", got "${found.status}"`);
  // payment_status is included on the customer-facing list too (unlike
  // the vendor-facing one, it isn't filtered) so the app can render
  // "Payment pending"/"Payment failed" states for orders stuck earlier.
  assert(
    found.payment_status === "paid",
    `expected payment_status "paid" on a completed order, got "${found.payment_status}"`
  );
  say(section, `  -> found order ${orderId} with status completed, payment_status paid`);
}

// --- Section 7: abandoned order expiry -------------------------------------

async function expiredOrderCleanup(customerToken, shopId) {
  const section = "expiredCleanup";

  // Needed for the direct backdate + verification below - there's no HTTP
  // way to do either.
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  say(section, "Creating a test order and leaving it pending (simulating an abandoned order)");
  const [upload] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-expiring.pdf` },
  ]);
  const order = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E expiry test order ${STAMP}`,
    },
  });
  assert(order.status === 201, `expected 201, got ${order.status}: ${JSON.stringify(order.data)}`);
  const orderId = order.data._id;
  created.orderIds.push(orderId);
  say(section, `  -> order created: id ${orderId}, status ${order.data.status}`);

  say(section, "Backdating the order's updatedAt to 49 hours ago");
  const backdated = new Date(Date.now() - 49 * 60 * 60 * 1000);
  // Goes through the raw driver collection, not the Mongoose Model - a
  // Model.updateOne() here would have its timestamps middleware silently
  // overwrite updatedAt back to "now", defeating the whole point.
  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(orderId) },
    { $set: { updatedAt: backdated } }
  );

  say(section, "Running the abandoned-order cleanup directly (not waiting for its real 15-minute schedule)");
  await cleanupAbandonedOrders();

  const afterCleanup = await Order.findById(orderId);
  assert(afterCleanup, `order ${orderId} should still exist after cleanup - only its files get deleted, not the record`);
  assert(
    afterCleanup.status === "expired",
    `expected status "expired" after cleanup ran on an order stuck pending for 49h, got "${afterCleanup.status}"`
  );
  say(section, '  -> confirmed: order status is now "expired", not stuck at "pending"');

  const uploadGone = await Upload.findById(upload.upload_id);
  assert(!uploadGone, `expected Upload record ${upload.upload_id} to be deleted by the cleanup, but it still exists`);
  say(section, "  -> confirmed: its Upload record was deleted too");

  // --- New: payment abandonment (payment_status stuck "created") ---------
  say(section, "Creating a second test order and leaving it completely unpaid (simulating payment abandonment)");
  const [upload2] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-unpaid.pdf` },
  ]);
  const order2 = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload2.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E payment-abandonment test order ${STAMP}`,
    },
  });
  assert(order2.status === 201, `expected 201, got ${order2.status}: ${JSON.stringify(order2.data)}`);
  const order2Id = order2.data._id;
  created.orderIds.push(order2Id);
  assert(
    order2.data.payment_status === "created",
    `expected payment_status "created" right after creation, got "${order2.data.payment_status}"`
  );
  say(section, `  -> order created: id ${order2Id}, payment_status "created", never touched after this`);

  say(section, "Backdating the order's createdAt to 61 minutes ago (payment should resolve in minutes, not hours)");
  const paymentBackdate = new Date(Date.now() - 61 * 60 * 1000);
  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(order2Id) },
    { $set: { createdAt: paymentBackdate } }
  );

  say(section, "Running the abandoned-order cleanup again");
  await cleanupAbandonedOrders();

  const afterCleanup2 = await Order.findById(order2Id);
  assert(afterCleanup2, `order ${order2Id} should still exist after cleanup`);
  assert(
    afterCleanup2.status === "expired",
    `expected status "expired" for an order left unpaid for 61 minutes, got "${afterCleanup2.status}"`
  );
  say(section, '  -> confirmed: unpaid order status is now "expired"');

  const upload2Gone = await Upload.findById(upload2.upload_id);
  assert(!upload2Gone, `expected Upload record ${upload2.upload_id} to be deleted by the cleanup, but it still exists`);
  say(section, "  -> confirmed: its Upload record was deleted too");

  // --- Negative control: a FAILED payment must NOT be swept up here,
  // even when just as old - only a payment that was never attempted is,
  // since a failed one is meant to still be retryable indefinitely. ---
  say(section, "Creating a third order and forcing its payment to FAIL (not just leaving it unpaid)");
  const [upload3] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-failed-not-swept.pdf` },
  ]);
  const order3 = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload3.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E failed-payment-not-swept test order ${STAMP}`,
    },
  });
  assert(order3.status === 201, `expected 201, got ${order3.status}: ${JSON.stringify(order3.data)}`);
  const order3Id = order3.data._id;
  created.orderIds.push(order3Id);

  const rzp3 = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: order3Id },
  });
  assert(rzp3.status === 200, `expected 200, got ${rzp3.status}: ${JSON.stringify(rzp3.data)}`);

  const badVerify3 = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: order3Id,
      razorpay_order_id: rzp3.data.razorpay_order_id,
      razorpay_payment_id: `pay_e2e_${STAMP}_notswept`,
      razorpay_signature: "0".repeat(64), // well-formed hex, deliberately wrong
    },
  });
  assert(badVerify3.status === 400, `expected 400 for a wrong signature, got ${badVerify3.status}`);
  say(section, "  -> forced payment_status to \"failed\" via a deliberately wrong signature");

  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(order3Id) },
    { $set: { createdAt: paymentBackdate } }
  );

  say(section, "Running the abandoned-order cleanup a third time");
  await cleanupAbandonedOrders();

  const afterCleanup3 = await Order.findById(order3Id);
  assert(
    afterCleanup3.status === "pending",
    `expected a FAILED-payment order to be left alone (still "pending"), got status "${afterCleanup3.status}"`
  );
  assert(
    afterCleanup3.payment_status === "failed",
    `expected payment_status to remain "failed", got "${afterCleanup3.payment_status}"`
  );
  say(section, '  -> confirmed: a FAILED (not merely unpaid) payment survives the sweep untouched, since it can still be retried');

  // --- An expired order must never be payable ---------------------------
  // A Razorpay order is issued while the order is still live, THEN the
  // order expires - so verify is exercised with a signature that is
  // genuinely valid for a Razorpay order this record really issued. Only
  // the expired status should stop it.
  say(section, "Creating a fourth order and starting checkout (Razorpay order issued) before it expires");
  const [upload4] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-expired-unpayable.pdf` },
  ]);
  const order4 = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload4.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E expired-order-unpayable test order ${STAMP}`,
    },
  });
  assert(order4.status === 201, `expected 201, got ${order4.status}: ${JSON.stringify(order4.data)}`);
  const order4Id = order4.data._id;
  created.orderIds.push(order4Id);

  const rzp4 = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: order4Id },
  });
  assert(rzp4.status === 200, `expected 200 while still pending, got ${rzp4.status}: ${JSON.stringify(rzp4.data)}`);

  say(section, "Backdating it 61 minutes and running the cleanup so it expires");
  await Order.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(order4Id) },
    { $set: { createdAt: paymentBackdate } }
  );
  await cleanupAbandonedOrders();
  const expired4 = await Order.findById(order4Id);
  assert(expired4.status === "expired", `expected status "expired" before the payment checks, got "${expired4.status}"`);
  say(section, '  -> order is now "expired", its documents deleted');

  say(section, "POST /payments/razorpay/create-order against the expired order - expect 400");
  const rzpExpired = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: order4Id },
  });
  assert(rzpExpired.status === 400, `expected 400, got ${rzpExpired.status}: ${JSON.stringify(rzpExpired.data)}`);
  assert(
    /expired/i.test(rzpExpired.data?.message || ""),
    `expected an "expired" message, got ${JSON.stringify(rzpExpired.data)}`
  );
  say(section, `  -> rejected: "${rzpExpired.data.message}"`);

  say(section, "POST /payments/razorpay/verify with a CORRECT signature for the pre-expiry Razorpay order - expect 400");
  const paymentId4 = `pay_e2e_${STAMP}_expired`;
  const verifyExpired = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: order4Id,
      razorpay_order_id: rzp4.data.razorpay_order_id,
      razorpay_payment_id: paymentId4,
      razorpay_signature: computeRazorpaySignature(rzp4.data.razorpay_order_id, paymentId4),
    },
  });
  assert(verifyExpired.status === 400, `expected 400, got ${verifyExpired.status}: ${JSON.stringify(verifyExpired.data)}`);
  assert(verifyExpired.data.otp === undefined, "a rejected verification must never return an otp");

  const afterVerify4 = await Order.findById(order4Id);
  assert(
    afterVerify4.payment_status !== "paid",
    `an expired order must never become paid, got payment_status "${afterVerify4.payment_status}"`
  );
  assert(!afterVerify4.otp, `an expired order must never get an otp, got "${afterVerify4.otp}"`);
  say(section, `  -> rejected: "${verifyExpired.data.message}" - payment_status "${afterVerify4.payment_status}", no otp`);
}

// --- Section 8: itemized pricing (paper size / sides / add-on services) ---

async function itemizedPricing(customerToken, vendorToken, shopId) {
  const section = "itemizedPricing";

  say(section, "GET /shops/me/pricing right after shop creation - confirming it was prefilled from Settings");
  const initialPricing = await api("GET", "/shops/me/pricing", { token: vendorToken });
  assert(initialPricing.status === 200, `expected 200, got ${initialPricing.status}: ${JSON.stringify(initialPricing.data)}`);

  // GET /pricing-config only ever returns platform_fee_type/value now (it
  // was repurposed once pricing became per-shop - see pricingController.js
  // and Section 15 below) - kept for that below, but it can no longer
  // answer what a new shop's rates were SEEDED from. Read the Settings
  // document directly instead for that half of the check, the same way
  // CLEANUP and admin provisioning elsewhere in this file reach past the
  // HTTP API for things it doesn't expose.
  const settingsRates = await api("GET", "/pricing-config");
  assert(settingsRates.status === 200, `expected 200, got ${settingsRates.status}`);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const settingsDoc = await Settings.findOne();
  assert(settingsDoc, "expected the Settings singleton document to already exist");
  assert(
    initialPricing.data.rate_per_page_bw === settingsDoc.rate_per_page_bw &&
      initialPricing.data.rate_per_page_color === settingsDoc.rate_per_page_color &&
      initialPricing.data.paper_size_rates.A3 === settingsDoc.paper_size_rates.A3 &&
      initialPricing.data.sides_extra_rate === settingsDoc.sides_extra_rate,
    `expected a new shop's pricing to be prefilled from Settings, got ${JSON.stringify(initialPricing.data)} vs Settings ${JSON.stringify(settingsDoc)}`
  );
  // Services are vendor-defined free text now, so there is nothing
  // generic to seed a new shop with - it starts with an empty list and
  // the vendor adds what they actually offer.
  assert(
    Array.isArray(initialPricing.data.services) && initialPricing.data.services.length === 0,
    `a new shop should start with NO services, got ${JSON.stringify(initialPricing.data.services)}`
  );
  say(section, "  -> confirmed: base rates prefilled from Settings, services start as an empty list");

  say(section, "PATCH /shops/me/pricing with a services object - expect 400 (services have their own routes now)");
  const oldShapeServices = await api("PATCH", "/shops/me/pricing", {
    token: vendorToken,
    body: { services: { lamination: { enabled: true, rate: 5 } } },
  });
  assert(
    oldShapeServices.status === 400,
    `expected 400 for the old fixed-services shape, got ${oldShapeServices.status}: ${JSON.stringify(oldShapeServices.data)}`
  );
  say(section, `  -> rejected: "${oldShapeServices.data.message}"`);

  say(section, "PATCH /shops/me/pricing with a negative rate - expect 400");
  const badRate = await api("PATCH", "/shops/me/pricing", { token: vendorToken, body: { rate_per_page_bw: -1 } });
  assert(badRate.status === 400, `expected 400, got ${badRate.status}: ${JSON.stringify(badRate.data)}`);
  say(section, `  -> rejected: "${badRate.data.message}"`);

  say(section, "PATCH /shops/me/pricing with a negative sides_extra_rate - expect 400");
  const badSides = await api("PATCH", "/shops/me/pricing", { token: vendorToken, body: { sides_extra_rate: -1 } });
  assert(badSides.status === 400, `expected 400, got ${badSides.status}: ${JSON.stringify(badSides.data)}`);
  say(section, `  -> rejected: "${badSides.data.message}"`);

  // The old field had a 0-100 ceiling because it was a percentage. A
  // flat price has no such ceiling, so a value that used to be rejected
  // outright must now be accepted - this is the assertion that would
  // catch the ceiling being left behind by mistake.
  say(section, "PATCH /shops/me/pricing with sides_extra_rate 150 - now VALID (it is a price, not a percentage)");
  const bigSides = await api("PATCH", "/shops/me/pricing", { token: vendorToken, body: { sides_extra_rate: 150 } });
  assert(bigSides.status === 200, `expected 200, got ${bigSides.status}: ${JSON.stringify(bigSides.data)}`);
  assert(
    bigSides.data.sides_extra_rate === 150,
    `expected sides_extra_rate 150, got ${bigSides.data.sides_extra_rate}`
  );
  say(section, "  -> accepted: a flat rate has no upper bound");

  say(section, "PATCH /shops/me/pricing with the OLD sides_surcharge_percent field - expect 400");
  const oldSidesField = await api("PATCH", "/shops/me/pricing", {
    token: vendorToken,
    body: { sides_surcharge_percent: 20 },
  });
  assert(
    oldSidesField.status === 400,
    `expected 400 for the removed percentage field, got ${oldSidesField.status}: ${JSON.stringify(oldSidesField.data)}`
  );
  say(section, `  -> rejected: "${oldSidesField.data.message}"`);

  // Put it back to a deliberate, legible value before anything is
  // ordered: the 150 above was proving the ceiling is gone, and leaving
  // it there would price this section's duplex document at ₹600 and bury
  // a real regression in an absurd number. Everything below still reads
  // the shop's rates back rather than assuming this figure.
  const sidesExtraRate = 1;
  const setSides = await api("PATCH", "/shops/me/pricing", {
    token: vendorToken,
    body: { sides_extra_rate: sidesExtraRate },
  });
  assert(setSides.status === 200, `expected 200, got ${setSides.status}: ${JSON.stringify(setSides.data)}`);
  assert(
    setSides.data.sides_extra_rate === sidesExtraRate,
    `expected sides_extra_rate ${sidesExtraRate}, got ${setSides.data.sides_extra_rate}`
  );
  say(section, `  -> double-sided set to a flat ₹${sidesExtraRate} per page for the pricing checks below`);

  say(section, "Vendor defines their own services with their own names and rates");
  // The shop defines its OWN services, with its own names - nothing here
  // is a key this codebase knows about.
  const customSpiralRate = 35;
  const customLaminationRate = 15;

  say(section, "POST /shops/me/pricing/services - vendor adds their own named services");
  const addSpiral = await api("POST", "/shops/me/pricing/services", {
    token: vendorToken,
    body: { name: "Spiral Binding", rate: customSpiralRate },
  });
  assert(addSpiral.status === 201, `expected 201, got ${addSpiral.status}: ${JSON.stringify(addSpiral.data)}`);
  const addLamination = await api("POST", "/shops/me/pricing/services", {
    token: vendorToken,
    body: { name: "Matte Lamination", rate: customLaminationRate },
  });
  assert(addLamination.status === 201, `expected 201, got ${addLamination.status}`);
  assert(addLamination.data.length === 2, `expected 2 services, got ${addLamination.data.length}`);
  say(section, `  -> "Spiral Binding" ₹${customSpiralRate} and "Matte Lamination" ₹${customLaminationRate} added`);

  say(section, "POST the same name again (different case) - expect 409, it would be unorderable");
  const dupService = await api("POST", "/shops/me/pricing/services", {
    token: vendorToken,
    body: { name: "  matte LAMINATION  ", rate: 99 },
  });
  assert(dupService.status === 409, `expected 409, got ${dupService.status}: ${JSON.stringify(dupService.data)}`);
  say(section, `  -> rejected: "${dupService.data.message}"`);

  say(section, "PATCH one service's rate - the other must be untouched");
  const laminationId = addLamination.data.find((sv) => sv.name === "Matte Lamination")._id;
  const patchedService = await api("PATCH", `/shops/me/pricing/services/${laminationId}`, {
    token: vendorToken,
    body: { rate: customLaminationRate },
  });
  assert(patchedService.status === 200, `expected 200, got ${patchedService.status}: ${JSON.stringify(patchedService.data)}`);
  const spiralAfter = patchedService.data.find((sv) => sv.name === "Spiral Binding");
  assert(
    spiralAfter.rate === customSpiralRate,
    `updating one service must not touch another - Spiral Binding is now ₹${spiralAfter.rate}`
  );

  say(section, "Adding then DELETING a throwaway service");
  const temp = await api("POST", "/shops/me/pricing/services", {
    token: vendorToken,
    body: { name: "Temporary Service", rate: 1 },
  });
  assert(temp.status === 201, `expected 201, got ${temp.status}`);
  const tempId = temp.data.find((sv) => sv.name === "Temporary Service")._id;
  const removed = await api("DELETE", `/shops/me/pricing/services/${tempId}`, { token: vendorToken });
  assert(removed.status === 200, `expected 200, got ${removed.status}: ${JSON.stringify(removed.data)}`);
  assert(
    !removed.data.some((sv) => sv.name === "Temporary Service"),
    "deleted service should be gone from the list"
  );
  assert(removed.data.length === 2, `expected 2 services left, got ${removed.data.length}`);
  say(section, "  -> add / duplicate-reject / patch / delete all behave");

  say(section, "Ordering a service name this shop does not offer - expect 400, not a free service");
  const [uploadReject] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-itemized-reject.pdf` },
  ]);
  const rejectedOrder = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([uploadReject.upload_id], { color_mode: "bw", copies: 1, services: ["Stapling"] }),
    },
  });
  assert(rejectedOrder.status === 400, `expected 400, got ${rejectedOrder.status}: ${JSON.stringify(rejectedOrder.data)}`);
  say(section, `  -> rejected as expected: "${rejectedOrder.data.message}"`);

  say(section, "Fetching this shop's live pricing again for the actual order math below");
  const shopPricing = await api("GET", "/shops/me/pricing", { token: vendorToken });
  assert(shopPricing.status === 200, `expected 200, got ${shopPricing.status}`);
  const rates = shopPricing.data;
  const laminationService = rates.services.find((sv) => sv.name === "Matte Lamination");
  assert(laminationService, `expected "Matte Lamination" in ${JSON.stringify(rates.services)}`);
  say(
    section,
    `  -> rates OK: A3 +₹${rates.paper_size_rates.A3}/pg, double-sided +₹${rates.sides_extra_rate}/pg, ` +
      `services: ${rates.services.map((sv) => `"${sv.name}" ₹${sv.rate}`).join(", ")}`
  );

  say(section, "Uploading two test PDFs to be printed with GENUINELY DIFFERENT settings");
  const [uploadDoc1, uploadDoc2] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(3), filename: `e2e-test-${STAMP}-itemized-doc1.pdf` },
    { buffer: makeDummyPdfBuffer(2), filename: `e2e-test-${STAMP}-itemized-doc2.pdf` },
  ]);

  // The whole point of per-document settings: these two share nothing.
  // Doc 1 is a plain B&W handout; doc 2 is a laminated colour A3 poster
  // printed double-sided in duplicate.
  const doc1Settings = {
    color_mode: "bw",
    copies: 1,
    paper_size: "A4",
    sides: "single",
    services: [],
  };
  const doc2Settings = {
    color_mode: "color",
    copies: 2,
    paper_size: "A3",
    sides: "double",
    // By NAME, exactly as this shop lists it.
    services: ["Matte Lamination"],
  };

  say(section, "Creating one order: doc 1 = B&W/1/A4/single, doc 2 = colour/2/A3/double/lamination");
  const order = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: [
        { upload_id: uploadDoc1.upload_id, ...doc1Settings },
        { upload_id: uploadDoc2.upload_id, ...doc2Settings },
      ],
      instructions: `E2E itemized pricing test ${STAMP}`,
    },
  });
  assert(order.status === 201, `expected 201, got ${order.status}: ${JSON.stringify(order.data)}`);
  created.orderIds.push(order.data._id);

  // Each document's expected bill, worked out independently here from
  // this shop's own rates (fetched above, not hardcoded) - deliberately
  // NOT by calling the same helper the server uses, so a bug in that
  // helper can't agree with itself and pass.
  const pages1 = uploadDoc1.page_count;
  const pages2 = uploadDoc2.page_count;

  const doc1Base = pages1 * 1 * rates.rate_per_page_bw;
  const doc1Paper = pages1 * 1 * (rates.paper_size_rates.A4 ?? 0); // A4 is normally 0
  const doc1Sides = 0; // single-sided
  const doc1Services = 0; // none requested
  const doc1Total = doc1Base + doc1Paper + doc1Sides + doc1Services;

  const doc2Base = pages2 * 2 * rates.rate_per_page_color;
  const doc2Paper = pages2 * 2 * rates.paper_size_rates.A3;
  // pages x copies x the shop's flat rate - NOT a fraction of doc2Base.
  // Worked out from the shop's own fetched rate, independently of the
  // server helper, so a bug in that helper cannot agree with itself.
  const doc2Sides = Math.round(pages2 * 2 * rates.sides_extra_rate * 100) / 100;
  const doc2Services = laminationService.rate; // one service, flat per document
  const doc2Total = doc2Base + doc2Paper + doc2Sides + doc2Services;

  // Per-document breakdown, stored on each documents[] entry.
  const [gotDoc1, gotDoc2] = order.data.documents;
  assert(order.data.documents.length === 2, `expected 2 documents, got ${order.data.documents.length}`);

  // Settings must come back exactly as sent, per document - this is what
  // the shop actually prints from.
  assert(gotDoc1.color_mode === "bw" && gotDoc1.copies === 1, `doc 1 settings not stored: ${JSON.stringify(gotDoc1)}`);
  assert(gotDoc1.paper_size === "A4" && gotDoc1.sides === "single", `doc 1 settings not stored: ${JSON.stringify(gotDoc1)}`);
  assert(
    gotDoc2.color_mode === "color" && gotDoc2.copies === 2 && gotDoc2.paper_size === "A3" && gotDoc2.sides === "double",
    `doc 2 settings not stored: ${JSON.stringify(gotDoc2)}`
  );
  // Services are stored as a SNAPSHOT of what was sold, not a reference:
  // name and rate are copied in at order time so a later rename, re-price
  // or delete can't rewrite this order.
  assert(
    Array.isArray(gotDoc2.services) && gotDoc2.services.length === 1,
    `doc 2 should have exactly one service, got ${JSON.stringify(gotDoc2.services)}`
  );
  assert(
    gotDoc2.services[0].name === "Matte Lamination" && gotDoc2.services[0].rate === laminationService.rate,
    `doc 2 should snapshot the shop's own name and rate, got ${JSON.stringify(gotDoc2.services[0])}`
  );
  assert(
    gotDoc2.services[0].service_id === laminationService._id,
    `doc 2 should record which service it matched, got ${JSON.stringify(gotDoc2.services[0].service_id)}`
  );
  assert(
    Array.isArray(gotDoc1.services) && gotDoc1.services.length === 0,
    `doc 1 asked for no services - services are per document, got ${JSON.stringify(gotDoc1.services)}`
  );

  assert(gotDoc1.pricing.base === doc1Base, `doc 1 base: expected ${doc1Base}, got ${gotDoc1.pricing.base}`);
  assert(gotDoc1.pricing.sides_charge === 0, `doc 1 is single-sided, expected no sides charge, got ${gotDoc1.pricing.sides_charge}`);
  assert(
    gotDoc1.pricing.services_charge === 0,
    `doc 1 requested no services, expected 0, got ${gotDoc1.pricing.services_charge} - a per-order service charge would leak in here`
  );
  assert(
    gotDoc1.pricing.document_total === doc1Total,
    `doc 1 total: expected ${doc1Total}, got ${gotDoc1.pricing.document_total}`
  );

  assert(gotDoc2.pricing.base === doc2Base, `doc 2 base: expected ${doc2Base}, got ${gotDoc2.pricing.base}`);
  assert(gotDoc2.pricing.paper_charge === doc2Paper, `doc 2 paper: expected ${doc2Paper}, got ${gotDoc2.pricing.paper_charge}`);
  assert(gotDoc2.pricing.sides_charge === doc2Sides, `doc 2 sides: expected ${doc2Sides}, got ${gotDoc2.pricing.sides_charge}`);
  assert(
    gotDoc2.pricing.services_charge === doc2Services,
    `doc 2 services: expected ${doc2Services}, got ${gotDoc2.pricing.services_charge}`
  );
  assert(
    gotDoc2.pricing.document_total === doc2Total,
    `doc 2 total: expected ${doc2Total}, got ${gotDoc2.pricing.document_total}`
  );
  say(section, `  -> per-document totals OK: doc 1 ₹${doc1Total}, doc 2 ₹${doc2Total}`);

  // Order-level figures must be the SUMS of the per-document ones.
  const expectedBaseSubtotal = doc1Base + doc2Base;
  const expectedPaperSizeCharge = doc1Paper + doc2Paper;
  const expectedSidesCharge = doc1Sides + doc2Sides;
  const expectedServicesCharge = doc1Services + doc2Services;
  const expectedPreFeeTotal =
    expectedBaseSubtotal + expectedPaperSizeCharge + expectedSidesCharge + expectedServicesCharge;
  // platform_fee is the one component still global - from Settings
  // (settingsRates above), not this shop's own pricing.
  const expectedPlatformFee =
    settingsRates.data.platform_fee_type === "percentage"
      ? Math.round(expectedPreFeeTotal * (settingsRates.data.platform_fee_value / 100) * 100) / 100
      : settingsRates.data.platform_fee_value;
  const expectedTotal = expectedPreFeeTotal + expectedPlatformFee;

  assert(order.data.base_subtotal === expectedBaseSubtotal, `base_subtotal: expected ${expectedBaseSubtotal}, got ${order.data.base_subtotal}`);
  assert(order.data.paper_size_charge === expectedPaperSizeCharge, `paper_size_charge: expected ${expectedPaperSizeCharge}, got ${order.data.paper_size_charge}`);
  assert(order.data.sides_charge === expectedSidesCharge, `sides_charge: expected ${expectedSidesCharge}, got ${order.data.sides_charge}`);
  assert(order.data.services_charge === expectedServicesCharge, `services_charge: expected ${expectedServicesCharge}, got ${order.data.services_charge}`);
  assert(order.data.platform_fee === expectedPlatformFee, `platform_fee: expected ${expectedPlatformFee}, got ${order.data.platform_fee}`);
  assert(order.data.total_amount === expectedTotal, `total_amount: expected ${expectedTotal}, got ${order.data.total_amount}`);

  // The invariant that makes the bill trustworthy: the order total is
  // exactly its own line items plus the fee. Checked separately from the
  // figures
  // above, which are derived from the same inputs rather than the stored
  // documents.
  const sumOfStoredDocs = order.data.documents.reduce((n, d) => n + d.pricing.document_total, 0);
  assert(
    Math.round((sumOfStoredDocs + order.data.platform_fee) * 100) / 100 === order.data.total_amount,
    `stored documents sum (${sumOfStoredDocs}) + fee (${order.data.platform_fee}) should equal total (${order.data.total_amount})`
  );
  say(
    section,
    `  -> order totals OK: ${order.data.base_subtotal} + ${order.data.paper_size_charge} (paper) + ${order.data.sides_charge} (sides) + ${order.data.services_charge} (services) + ${order.data.platform_fee} (fee) = ${order.data.total_amount}, and it equals the sum of both documents`
  );

  // Per-document service validation: only doc 2 asks for something the
  // shop hasn't enabled, and the message must say WHICH document.
  say(section, "Ordering an unknown service name on the SECOND document only - the error must name document 2");
  const [uploadOk, uploadBadService] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-itemized-ok.pdf` },
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-itemized-bad.pdf` },
  ]);
  const perDocReject = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: [
        { upload_id: uploadOk.upload_id, color_mode: "bw", copies: 1 },
        { upload_id: uploadBadService.upload_id, color_mode: "bw", copies: 1, services: ["Hole Punching"] },
      ],
    },
  });
  assert(perDocReject.status === 400, `expected 400, got ${perDocReject.status}: ${JSON.stringify(perDocReject.data)}`);
  assert(
    /document 2/i.test(perDocReject.data.message || "") && /hole punching/i.test(perDocReject.data.message || ""),
    `expected the message to name document 2 and the unmatched service, got ${JSON.stringify(perDocReject.data.message)}`
  );
  say(section, `  -> rejected as expected: "${perDocReject.data.message}"`);

  // A near-miss must NOT be accepted when ORDERING: by this point the
  // customer is looking at this shop's actual service names, so a
  // substring match could charge them for a different, pricier service
  // than the one they picked. (compare-pricing deliberately does match by
  // substring - see Section 13.)
  say(section, 'Ordering "Lamination" when the shop only offers "Matte Lamination" - expect 400');
  const [uploadNearMiss] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-nearmiss.pdf` },
  ]);
  const nearMiss = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: [{ upload_id: uploadNearMiss.upload_id, color_mode: "bw", copies: 1, services: ["Lamination"] }],
    },
  });
  assert(nearMiss.status === 400, `expected 400 for a partial name match, got ${nearMiss.status}: ${JSON.stringify(nearMiss.data)}`);
  say(section, `  -> rejected as expected: "${nearMiss.data.message}"`);

  // The snapshot is the whole reason services store name+rate rather than
  // an id: renaming the service must not rewrite the order that bought it.
  say(section, "Renaming the service AFTER the order - the order must still say what was sold");
  const renamed = await api("PATCH", `/shops/me/pricing/services/${laminationService._id}`, {
    token: vendorToken,
    body: { name: "Gloss Lamination", rate: 999 },
  });
  assert(renamed.status === 200, `expected 200, got ${renamed.status}: ${JSON.stringify(renamed.data)}`);
  const afterRename = await api("GET", "/orders/customer", { token: customerToken });
  const sameOrder = afterRename.data.find((o) => o._id === order.data._id);
  assert(
    sameOrder.documents[1].services[0].name === "Matte Lamination" &&
      sameOrder.documents[1].services[0].rate === laminationService.rate,
    `the order should keep its snapshot, got ${JSON.stringify(sameOrder.documents[1].services[0])}`
  );
  assert(
    sameOrder.total_amount === order.data.total_amount,
    `the order's total must not move when the shop re-prices: was ${order.data.total_amount}, now ${sameOrder.total_amount}`
  );
  say(section, "  -> confirmed: renamed and re-priced to ₹999, the placed order still says Matte Lamination at its original rate");

  // Put it back, so later sections see the name they expect.
  await api("PATCH", `/shops/me/pricing/services/${laminationService._id}`, {
    token: vendorToken,
    body: { name: "Matte Lamination", rate: laminationService.rate },
  });

  // Security check carried over from the base pricing pass: injected
  // price fields must still be ignored even with add-ons in the mix.
  say(section, "Attempting to inject fake charges into a second order - they must be ignored");
  const [upload2] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-itemized-injection.pdf` },
  ]);
  const injected = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload2.upload_id], { color_mode: "bw", copies: 1, paper_size: "A3", services: ["Spiral Binding"] }),
      base_subtotal: 1,
      paper_size_charge: 1,
      services_charge: 1,
      total_amount: 1,
    },
  });
  assert(injected.status === 201, `expected 201, got ${injected.status}: ${JSON.stringify(injected.data)}`);
  created.orderIds.push(injected.data._id);
  assert(injected.data.total_amount !== 1, "injected total_amount was NOT ignored - pricing security regression");
  const expectedRealPaperCharge = upload2.page_count * 1 * rates.paper_size_rates.A3; // copies=1
  assert(
    injected.data.paper_size_charge === expectedRealPaperCharge,
    `expected real paper_size_charge ${expectedRealPaperCharge}, got ${injected.data.paper_size_charge} (looks like the injected value leaked through)`
  );
  say(section, `  -> confirmed: injected prices ignored, real total_amount ${injected.data.total_amount} computed server-side`);
}

// --- Section 9: Razorpay payment verification ------------------------------
//
// Real Razorpay checkout needs a browser and can't be driven by a script,
// so this exercises the two endpoints directly: a manually-computed
// CORRECT signature (Case A) and a deliberately WRONG one (Case B), using
// the exact same HMAC formula and real test RAZORPAY_KEY_SECRET the
// backend itself uses. Case C additionally confirms the retry-after-
// failure path POST /payments/razorpay/create-order explicitly allows.

async function paymentVerification(customerToken, vendorToken, shopId) {
  const section = "paymentVerification";

  // --- Case A: a correct signature marks the order paid and generates an otp
  say(section, "Uploading a test PDF and creating an order to pay for");
  const [uploadA] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-pay-valid.pdf` },
  ]);
  const orderA = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([uploadA.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E payment verification (valid signature) ${STAMP}`,
    },
  });
  assert(orderA.status === 201, `expected 201, got ${orderA.status}: ${JSON.stringify(orderA.data)}`);
  const orderAId = orderA.data._id;
  created.orderIds.push(orderAId);
  assert(!orderA.data.otp, `expected no otp at order creation, got "${orderA.data.otp}"`);
  assert(
    orderA.data.payment_status === "created",
    `expected payment_status "created", got "${orderA.data.payment_status}"`
  );

  say(section, "POST /payments/razorpay/create-order");
  const rzpA = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: orderAId },
  });
  assert(rzpA.status === 200, `expected 200, got ${rzpA.status}: ${JSON.stringify(rzpA.data)}`);
  assert(rzpA.data.razorpay_order_id, "response is missing razorpay_order_id");
  assert(
    rzpA.data.key_id === process.env.RAZORPAY_KEY_ID,
    "response key_id does not match this server's RAZORPAY_KEY_ID - key_secret must never be returned instead"
  );
  assert(rzpA.data.currency === "INR", `expected currency "INR", got "${rzpA.data.currency}"`);
  const expectedPaiseA = Math.round(orderA.data.total_amount * 100);
  assert(
    rzpA.data.amount_in_paise === expectedPaiseA,
    `expected amount_in_paise ${expectedPaiseA} (total_amount ${orderA.data.total_amount} x 100), got ${rzpA.data.amount_in_paise}`
  );
  say(section, `  -> Razorpay order ${rzpA.data.razorpay_order_id} created for ${rzpA.data.amount_in_paise} paise`);

  const paymentIdA = `pay_e2e_${STAMP}_valid`;
  const correctSignature = computeRazorpaySignature(rzpA.data.razorpay_order_id, paymentIdA);

  say(section, "POST /payments/razorpay/verify with a manually-computed CORRECT signature");
  const verifyA = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: orderAId,
      razorpay_order_id: rzpA.data.razorpay_order_id,
      razorpay_payment_id: paymentIdA,
      razorpay_signature: correctSignature,
    },
  });
  assert(verifyA.status === 200, `expected 200, got ${verifyA.status}: ${JSON.stringify(verifyA.data)}`);
  assert(verifyA.data.success === true, `expected success true, got ${JSON.stringify(verifyA.data)}`);
  assert(
    typeof verifyA.data.otp === "string" && /^\d{6}$/.test(verifyA.data.otp),
    `expected a 6-digit otp, got "${verifyA.data.otp}"`
  );
  assert(
    verifyA.data.order?.payment_status === "paid",
    `expected payment_status "paid", got "${verifyA.data.order?.payment_status}"`
  );
  say(section, `  -> verified OK: payment_status "paid", otp ${verifyA.data.otp} generated`);

  say(section, `GET /orders/shop/${shopId} - confirming the now-PAID order is visible to the vendor`);
  const shopListA = await api("GET", `/orders/shop/${shopId}`, { token: vendorToken });
  assert(
    shopListA.data.find((o) => o._id === orderAId),
    `expected paid order ${orderAId} to appear in the shop's order list`
  );
  say(section, "  -> confirmed visible to the vendor now that it's paid");

  // --- Case B: a deliberately wrong signature is rejected, marks the
  // payment failed, and never generates an otp or exposes the order -----
  say(section, "Uploading a second test PDF and creating a second order");
  const [uploadB] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-pay-invalid.pdf` },
  ]);
  const orderB = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([uploadB.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E payment verification (wrong signature) ${STAMP}`,
    },
  });
  assert(orderB.status === 201, `expected 201, got ${orderB.status}: ${JSON.stringify(orderB.data)}`);
  const orderBId = orderB.data._id;
  created.orderIds.push(orderBId);

  const rzpB = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: orderBId },
  });
  assert(rzpB.status === 200, `expected 200, got ${rzpB.status}: ${JSON.stringify(rzpB.data)}`);

  const paymentIdB = `pay_e2e_${STAMP}_invalid`;
  // Deliberately wrong: a well-formed 64-char hex string that is NOT the
  // HMAC of this exact order/payment pair (computed against a tampered
  // payment id instead, so the server's recomputed signature can never
  // match it).
  const wrongSignature = computeRazorpaySignature(rzpB.data.razorpay_order_id, `${paymentIdB}-tampered`);

  say(section, "POST /payments/razorpay/verify with a deliberately WRONG signature");
  const verifyB = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: orderBId,
      razorpay_order_id: rzpB.data.razorpay_order_id,
      razorpay_payment_id: paymentIdB,
      razorpay_signature: wrongSignature,
    },
  });
  assert(verifyB.status === 400, `expected 400 for a wrong signature, got ${verifyB.status}: ${JSON.stringify(verifyB.data)}`);
  assert(verifyB.data.otp === undefined, "a rejected verification must never return an otp");
  assert(verifyB.data.order === undefined, "a rejected verification must never expose the order");
  assert(verifyB.data.success === undefined, "a rejected verification must never report success");
  say(section, `  -> correctly rejected: "${verifyB.data?.message}"`);

  say(section, "Confirming the order's payment_status is now \"failed\" with no otp, via the customer's own order list");
  const customerListAfterFail = await api("GET", "/orders/customer", { token: customerToken });
  const foundB = customerListAfterFail.data.find((o) => o._id === orderBId);
  assert(foundB, `order ${orderBId} not found in customer's order history`);
  assert(foundB.payment_status === "failed", `expected payment_status "failed", got "${foundB.payment_status}"`);
  assert(!foundB.otp, `expected no otp on a failed payment, got "${foundB.otp}"`);
  say(section, '  -> confirmed: payment_status "failed", no otp');

  say(section, `GET /orders/shop/${shopId} - confirming the failed-payment order is NEVER visible to the vendor`);
  const shopListB = await api("GET", `/orders/shop/${shopId}`, { token: vendorToken });
  assert(
    !shopListB.data.find((o) => o._id === orderBId),
    `expected order ${orderBId} (failed payment) to be hidden from the vendor, but it was listed`
  );
  say(section, "  -> confirmed hidden from the vendor");

  // --- Case C: a retry after a failed payment is explicitly allowed and
  // can still succeed, against a FRESH Razorpay order for the SAME
  // Order record -------------------------------------------------------
  say(section, "Retrying payment for the same order after the failure, this time with a correct signature");
  const rzpBRetry = await api("POST", "/payments/razorpay/create-order", {
    token: customerToken,
    body: { order_id: orderBId },
  });
  assert(rzpBRetry.status === 200, `expected 200 on retry, got ${rzpBRetry.status}: ${JSON.stringify(rzpBRetry.data)}`);
  assert(
    rzpBRetry.data.razorpay_order_id !== rzpB.data.razorpay_order_id,
    "retrying after a failure should create a FRESH Razorpay order, not reuse the failed one"
  );

  const paymentIdBRetry = `pay_e2e_${STAMP}_retry`;
  const retrySignature = computeRazorpaySignature(rzpBRetry.data.razorpay_order_id, paymentIdBRetry);
  const verifyBRetry = await api("POST", "/payments/razorpay/verify", {
    token: customerToken,
    body: {
      order_id: orderBId,
      razorpay_order_id: rzpBRetry.data.razorpay_order_id,
      razorpay_payment_id: paymentIdBRetry,
      razorpay_signature: retrySignature,
    },
  });
  assert(verifyBRetry.status === 200, `expected 200 on retry verify, got ${verifyBRetry.status}: ${JSON.stringify(verifyBRetry.data)}`);
  assert(verifyBRetry.data.success === true, "expected the retry verification to succeed");
  assert(
    typeof verifyBRetry.data.otp === "string" && /^\d{6}$/.test(verifyBRetry.data.otp),
    `expected a 6-digit otp on retry, got "${verifyBRetry.data.otp}"`
  );
  say(section, `  -> retry succeeded: payment_status "paid", otp ${verifyBRetry.data.otp} generated`);
}

// --- Section 10: queue / rush indicator --------------------------------------

async function queueIndicator(customerToken, shopId) {
  const section = "queueIndicator";

  // No token on purpose - GET /shops/:shopId/queue is meant to be public,
  // so a customer can see how busy a shop looks before even logging in.
  // If it actually required auth, this call would 401 and fail the
  // assertion below rather than silently succeeding with a token nobody
  // meant to require.
  say(section, `GET /shops/${shopId}/queue with NO token - confirming it's really public`);
  const before = await api("GET", `/shops/${shopId}/queue`);
  assert(before.status === 200, `expected 200 (public, no auth), got ${before.status}: ${JSON.stringify(before.data)}`);
  assert(typeof before.data.active_orders_count === "number", "queue response missing numeric active_orders_count");
  assert(
    ["low", "medium", "high"].includes(before.data.rush_level),
    `expected rush_level to be low/medium/high, got "${before.data.rush_level}"`
  );
  const baselineCount = before.data.active_orders_count;
  say(section, `  -> baseline active_orders_count ${baselineCount}, rush_level "${before.data.rush_level}"`);

  // The shared test shop accumulates leftover orders from earlier
  // sections over a run (some left pending/ready on purpose - e.g.
  // section 4's wrong-OTP order), so everything below checks a RELATIVE
  // change rather than an absolute count - that holds no matter what
  // else is already sitting in the queue.
  say(section, "Creating and paying for order A at this shop");
  const [uploadA] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-queue-a.pdf` },
  ]);
  const orderA = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([uploadA.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E queue test A ${STAMP}`,
    },
  });
  assert(orderA.status === 201, `expected 201, got ${orderA.status}: ${JSON.stringify(orderA.data)}`);
  created.orderIds.push(orderA.data._id);
  const paymentA = await payForOrder(customerToken, orderA.data._id);
  say(section, `  -> order A ${orderA.data._id} created and paid, left pending`);

  // POST /payments/razorpay/verify's own success response should already
  // carry queue_position - the whole point of attachQueuePosition being
  // the one shared helper behind both this and GET /orders/customer is
  // that neither can drift from the other.
  assert(
    typeof paymentA.order?.queue_position === "number",
    `expected the verify response's order to carry a numeric queue_position, got ${JSON.stringify(paymentA.order?.queue_position)}`
  );
  say(section, `  -> verify response already carried queue_position ${paymentA.order.queue_position} - no refresh needed`);

  say(section, "GET /orders/customer - confirming it agrees with what verify just returned");
  const listAfterA = await api("GET", "/orders/customer", { token: customerToken });
  assert(listAfterA.status === 200, `expected 200, got ${listAfterA.status}`);
  const foundA = listAfterA.data.find((o) => o._id === orderA.data._id);
  assert(foundA, `order A ${orderA.data._id} not found in customer's order list`);
  assert(
    typeof foundA.queue_position === "number",
    `expected order A to carry a numeric queue_position while pending, got ${JSON.stringify(foundA.queue_position)}`
  );
  assert(
    foundA.queue_position === paymentA.order.queue_position,
    `expected GET /orders/customer's queue_position (${foundA.queue_position}) to match verify's (${paymentA.order.queue_position}) - the two must never disagree`
  );
  const positionA = foundA.queue_position;
  say(section, `  -> order A queue_position ${positionA}, verify and GET /orders/customer agree`);

  say(section, "Creating and paying for order B at the same shop, right after A");
  const [uploadB] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-queue-b.pdf` },
  ]);
  const orderB = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([uploadB.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E queue test B ${STAMP}`,
    },
  });
  assert(orderB.status === 201, `expected 201, got ${orderB.status}: ${JSON.stringify(orderB.data)}`);
  created.orderIds.push(orderB.data._id);
  const paymentB = await payForOrder(customerToken, orderB.data._id);
  say(section, `  -> order B ${orderB.data._id} created and paid, left pending`);
  assert(
    typeof paymentB.order?.queue_position === "number",
    `expected the verify response's order to carry a numeric queue_position, got ${JSON.stringify(paymentB.order?.queue_position)}`
  );
  assert(
    paymentB.order.queue_position === positionA + 1,
    `expected verify's queue_position for B (${paymentB.order.queue_position}) to be exactly one more than A's (${positionA}) - available immediately, before any GET /orders/customer refresh`
  );

  say(section, "GET /orders/customer - checking order B's queue_position is exactly one more than order A's");
  const listAfterB = await api("GET", "/orders/customer", { token: customerToken });
  const foundB = listAfterB.data.find((o) => o._id === orderB.data._id);
  assert(foundB, `order B ${orderB.data._id} not found in customer's order list`);
  assert(
    typeof foundB.queue_position === "number",
    `expected order B to carry a numeric queue_position while pending, got ${JSON.stringify(foundB.queue_position)}`
  );
  assert(
    foundB.queue_position === positionA + 1,
    `expected order B's queue_position (${foundB.queue_position}) to be exactly one more than order A's (${positionA}) - B was placed right after A at the same shop`
  );
  assert(
    foundB.queue_position === paymentB.order.queue_position,
    `expected GET /orders/customer's queue_position (${foundB.queue_position}) to match verify's (${paymentB.order.queue_position}) - the two must never disagree`
  );
  say(section, `  -> confirmed: order B queue_position ${foundB.queue_position} = order A's ${positionA} + 1, and verify/GET agree`);

  say(section, `GET /shops/${shopId}/queue - confirming active_orders_count grew by exactly 2 (both new paid orders)`);
  const after = await api("GET", `/shops/${shopId}/queue`);
  assert(after.status === 200, `expected 200, got ${after.status}: ${JSON.stringify(after.data)}`);
  assert(
    after.data.active_orders_count === baselineCount + 2,
    `expected active_orders_count to grow from ${baselineCount} to ${baselineCount + 2}, got ${after.data.active_orders_count}`
  );
  say(section, `  -> confirmed: active_orders_count ${baselineCount} -> ${after.data.active_orders_count}`);

  say(section, "GET /shops - confirming this shop's inline queue info agrees with the standalone endpoint");
  const shopList = await api("GET", "/shops", { token: customerToken });
  assert(shopList.status === 200, `expected 200, got ${shopList.status}`);
  const listedShop = shopList.data.find((s) => s._id === shopId);
  assert(listedShop, `shop ${shopId} not found in GET /shops`);
  assert(listedShop.queue, `expected shop ${shopId} to carry inline queue info in GET /shops`);
  assert(
    listedShop.queue.active_orders_count === after.data.active_orders_count,
    `expected GET /shops inline active_orders_count (${listedShop.queue.active_orders_count}) to match GET /shops/:shopId/queue (${after.data.active_orders_count})`
  );
  assert(
    listedShop.queue.rush_level === after.data.rush_level,
    `expected GET /shops inline rush_level ("${listedShop.queue.rush_level}") to match GET /shops/:shopId/queue ("${after.data.rush_level}")`
  );
  say(section, "  -> confirmed: GET /shops inline queue info matches GET /shops/:shopId/queue exactly");

  // GET /shops/:shopId - the app's shop-details screen. Unlike the
  // listing it DOES return pricing (that screen's whole point is letting a
  // customer read the rates before uploading anything), but the same
  // fields stay hidden either way.
  say(section, `GET /shops/${shopId} - shop details for the customer-facing profile screen`);
  const detail = await api("GET", `/shops/${shopId}`, { token: customerToken });
  assert(detail.status === 200, `expected 200, got ${detail.status}: ${JSON.stringify(detail.data)}`);
  assert(detail.data.pricing?.rate_per_page_bw >= 0, "expected details to carry pricing (the listing omits it)");
  assert(detail.data.owner_photo_url !== undefined, "expected details to carry owner_photo_url");
  assert(
    typeof detail.data.is_currently_open === "boolean",
    `expected a computed is_currently_open, got ${JSON.stringify(detail.data.is_currently_open)}`
  );
  for (const hidden of ["kyc", "verification_status", "owner_id", "is_open", "business_hours"]) {
    assert(
      detail.data[hidden] === undefined,
      `GET /shops/:shopId leaked "${hidden}" to a customer: ${JSON.stringify(detail.data[hidden])}`
    );
  }
  say(section, "  -> confirmed: pricing + photos present, is_currently_open computed, no raw/sensitive fields leaked");

  say(section, "Confirming a shop that doesn't exist is a 404, not an empty profile");
  const missingDetail = await api("GET", "/shops/000000000000000000000000", { token: customerToken });
  assert(missingDetail.status === 404, `expected 404, got ${missingDetail.status}`);
  say(section, "  -> confirmed: 404");
}

// --- Section 11: saved shops -------------------------------------------------

async function savedShops(customerToken, shopId) {
  const section = "savedShops";

  say(section, `POST /saved-shops for shop ${shopId}`);
  const save = await api("POST", "/saved-shops", { token: customerToken, body: { shop_id: shopId } });
  assert(save.status === 201, `expected 201, got ${save.status}: ${JSON.stringify(save.data)}`);
  assert(save.data.shop_id === shopId, "saved-shop response has the wrong shop_id");
  say(section, "  -> saved OK");

  say(section, "GET /saved-shops - checking it appears with populated shop details");
  const list = await api("GET", "/saved-shops", { token: customerToken });
  assert(list.status === 200, `expected 200, got ${list.status}`);
  const found = list.data.find((s) => (s.shop_id?._id || s.shop_id) === shopId);
  assert(found, `saved shop ${shopId} not found in GET /saved-shops`);
  assert(found.shop_id?.shop_name, "expected shop_id to be populated with shop_name, got: " + JSON.stringify(found.shop_id));
  say(section, `  -> found, populated with shop_name "${found.shop_id.shop_name}"`);

  say(section, "Confirming the populated shop carries is_currently_open, and never the raw/sensitive fields it's computed from");
  assert(
    found.shop_id.is_currently_open === true,
    `expected is_currently_open true (shop was never closed in this run), got ${JSON.stringify(found.shop_id.is_currently_open)}`
  );
  assert(found.shop_id.is_open === undefined, "GET /saved-shops must never include the raw is_open field");
  assert(found.shop_id.business_hours === undefined, "GET /saved-shops must never include the raw business_hours field");
  assert(found.shop_id.kyc === undefined, "GET /saved-shops must never include kyc - same rule as GET /shops");
  assert(
    found.shop_id.verification_status === undefined,
    "GET /saved-shops must never include verification_status - same rule as GET /shops"
  );
  say(section, "  -> confirmed: is_currently_open present, no raw is_open/business_hours/kyc/verification_status leaked");

  say(section, "POST /saved-shops again (duplicate) - expect 409");
  const dup = await api("POST", "/saved-shops", { token: customerToken, body: { shop_id: shopId } });
  assert(dup.status === 409, `expected 409 for a duplicate save, got ${dup.status}: ${JSON.stringify(dup.data)}`);
  say(section, `  -> correctly rejected: "${dup.data?.message}"`);

  say(section, `DELETE /saved-shops/${shopId}`);
  const unsave = await api("DELETE", `/saved-shops/${shopId}`, { token: customerToken });
  assert(unsave.status === 200, `expected 200, got ${unsave.status}: ${JSON.stringify(unsave.data)}`);
  say(section, "  -> unsaved OK");

  say(section, "GET /saved-shops - confirming it's gone");
  const listAfter = await api("GET", "/saved-shops", { token: customerToken });
  const stillThere = listAfter.data.find((s) => (s.shop_id?._id || s.shop_id) === shopId);
  assert(!stillThere, "shop still appears in saved-shops after unsaving");
  say(section, "  -> confirmed removed");

  say(section, "DELETE /saved-shops/:shopId again (already removed) - expect 404");
  const unsaveAgain = await api("DELETE", `/saved-shops/${shopId}`, { token: customerToken });
  assert(unsaveAgain.status === 404, `expected 404, got ${unsaveAgain.status}: ${JSON.stringify(unsaveAgain.data)}`);
  say(section, `  -> correctly rejected: "${unsaveAgain.data?.message}"`);
}

// --- Section 12: notifications ------------------------------------------------

async function notifications(customerToken, vendorToken, shopId) {
  const section = "notifications";

  say(section, "Creating a fresh order to accept (triggers an order_accepted notification)");
  const [upload] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-notif.pdf` },
  ]);
  const order = await api("POST", "/orders", {
    token: customerToken,
    body: {
      shop_id: shopId,
      documents: docs([upload.upload_id], { color_mode: "bw", copies: 1 }),
      instructions: `E2E notification test ${STAMP}`,
    },
  });
  assert(order.status === 201, `expected 201, got ${order.status}: ${JSON.stringify(order.data)}`);
  const orderId = order.data._id;
  created.orderIds.push(orderId);

  say(section, `PATCH /orders/${orderId}/accept`);
  const accept = await api("PATCH", `/orders/${orderId}/accept`, { token: vendorToken });
  assert(accept.status === 200, `expected 200, got ${accept.status}: ${JSON.stringify(accept.data)}`);

  say(section, "GET /notifications as the customer - checking an order_accepted notification exists");
  const list = await api("GET", "/notifications", { token: customerToken });
  assert(list.status === 200, `expected 200, got ${list.status}`);
  const notif = list.data.find((n) => n.order_id === orderId && n.type === "order_accepted");
  assert(notif, `no order_accepted notification found for order ${orderId} in ${JSON.stringify(list.data)}`);
  assert(notif.read === false, `expected a fresh notification to be unread, got read=${notif.read}`);
  assert(notif.body && notif.body.length > 0, "notification has no body text");
  say(section, `  -> found: "${notif.title}" - "${notif.body}"`);

  say(section, `PATCH /notifications/${notif._id}/read`);
  const markRead = await api("PATCH", `/notifications/${notif._id}/read`, { token: customerToken });
  assert(markRead.status === 200, `expected 200, got ${markRead.status}: ${JSON.stringify(markRead.data)}`);
  assert(markRead.data.read === true, "notification was not marked read");
  say(section, "  -> marked read OK");

  say(section, "PATCH /notifications/read-all");
  const readAll = await api("PATCH", "/notifications/read-all", { token: customerToken });
  assert(readAll.status === 200, `expected 200, got ${readAll.status}: ${JSON.stringify(readAll.data)}`);
  say(section, `  -> OK, ${readAll.data.updated} notification(s) updated`);
}

// --- Section 13: compare pricing across shops ------------------------------
//
// POST /shops/compare-pricing needs shops with genuinely different, known
// rates to test meaningfully - the shared test shop used everywhere else
// works fine for single-shop pricing checks, but comparing prices needs at
// least two. This registers two throwaway vendor accounts/shops of its
// own, sets each one's pricing explicitly via PATCH /shops/me/pricing
// (rather than trusting whatever they were prefilled with), and approves
// both via a locally-provisioned admin - same pattern vendorOnboarding
// uses. Both shops are recorded in created.extraShopIds so cleanup()
// removes them alongside everything else.

// phonePrefix/contactPrefix are the older one-digit-namespace scheme; a
// caller can instead leave them out and get collision-proof numbers from
// uniquePhone() (see its comment).
async function registerApprovedShop(
  section,
  { label, phonePrefix, contactPrefix, shopSuffix, pricingPatch, services, adminToken }
) {
  const email = `test.vendor.${label}.${STAMP}@example.com`;
  const phone = phonePrefix ? makePhone(phonePrefix) : uniquePhone();
  const password = "TestPass123!";

  const reg = await api("POST", "/auth/register", {
    body: { name: `E2E Test Vendor ${label}`, phone, email, password, role: "shop_owner" },
  });
  assert(reg.status === 201, `[${label}] register expected 201, got ${reg.status}: ${JSON.stringify(reg.data)}`);
  created.userIds.push(reg.data.user.id);

  const login = await api("POST", "/auth/login", { body: { email, password } });
  assert(login.status === 200, `[${label}] login expected 200, got ${login.status}`);
  const vendorToken = login.data.token;

  const shopName = `Test Compare Shop ${shopSuffix} ${STAMP}`;
  const createRes = await api("POST", "/shops", {
    token: vendorToken,
    body: {
      shop_name: shopName,
      address: `1 ${shopSuffix} Lane, Test City`,
      contact: contactPrefix ? makePhone(contactPrefix) : uniquePhone(),
    },
  });
  assert(createRes.status === 201, `[${label}] create shop expected 201, got ${createRes.status}: ${JSON.stringify(createRes.data)}`);
  const shopId = createRes.data._id;
  created.extraShopIds.push(shopId);

  const pricingRes = await api("PATCH", "/shops/me/pricing", { token: vendorToken, body: pricingPatch });
  assert(pricingRes.status === 200, `[${label}] pricing patch expected 200, got ${pricingRes.status}: ${JSON.stringify(pricingRes.data)}`);

  // Services are a vendor-defined list with their own routes - they
  // cannot be set through PATCH /shops/me/pricing (which rejects them
  // outright now), so each is added individually, exactly as a real
  // vendor's dashboard would.
  for (const service of services || []) {
    const added = await api("POST", "/shops/me/pricing/services", { token: vendorToken, body: service });
    assert(
      added.status === 201,
      `[${label}] add service "${service.name}" expected 201, got ${added.status}: ${JSON.stringify(added.data)}`
    );
  }

  const approveRes = await api("PATCH", `/admin/shops/${shopId}/verify`, { token: adminToken, body: { status: "approved" } });
  assert(approveRes.status === 200, `[${label}] approve expected 200, got ${approveRes.status}: ${JSON.stringify(approveRes.data)}`);

  say(section, `  -> ${shopName} (${shopId}) registered, priced and approved`);
  return { shopId, vendorToken };
}

async function comparePricingAcrossShops(customerToken) {
  const section = "comparePricing";

  say(section, "Provisioning a one-off admin user to approve the two throwaway shops below");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const adminUser = await User.create({
    name: "E2E Test Admin (Compare Pricing)",
    phone: makePhone("1"),
    email: `test.admin.compare.${STAMP}@example.com`,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  say(section, `  -> admin user ${adminUser._id} provisioned`);

  // Three shops, each naming its services differently - which is the
  // whole point of vendor-defined services. A customer asking for
  // "lamination" must reach the first two by SUBSTRING match, at each
  // shop's own name and price, and must not reach the third at all.
  say(section, 'Registering a CHEAP shop whose service is called "Lamination"');
  const { shopId: cheapShopId } = await registerApprovedShop(section, {
    label: "cheap",
    phonePrefix: "5",
    contactPrefix: "4",
    shopSuffix: "Cheap",
    pricingPatch: {
      rate_per_page_bw: 1,
      rate_per_page_color: 1,
      paper_size_rates: { A4: 0, A3: 0 },
      sides_extra_rate: 0,
    },
    services: [{ name: "Lamination", rate: 5 }],
    adminToken,
  });

  say(section, 'Registering a PRICIER shop whose service is called "Glossy Lamination"');
  const { shopId: pricierShopId } = await registerApprovedShop(section, {
    label: "pricier",
    phonePrefix: "3",
    contactPrefix: "2",
    shopSuffix: "Pricier",
    pricingPatch: {
      rate_per_page_bw: 50,
      rate_per_page_color: 50,
      paper_size_rates: { A4: 0, A3: 0 },
      sides_extra_rate: 0,
    },
    services: [{ name: "Glossy Lamination", rate: 25 }],
    adminToken,
  });

  say(section, "Registering a THIRD shop that offers no lamination of any kind");
  const { shopId: noLaminationShopId } = await registerApprovedShop(section, {
    label: "nolam",
    shopSuffix: "NoLamination",
    pricingPatch: {
      rate_per_page_bw: 1,
      rate_per_page_color: 1,
      paper_size_rates: { A4: 0, A3: 0 },
      sides_extra_rate: 0,
    },
    services: [{ name: "Hole Punching", rate: 2 }],
    adminToken,
  });

  // Per-document shape, same as POST /orders minus upload_id (nothing is
  // uploaded yet at comparison time, so page_count is sent directly). Two
  // documents with different settings, so a shop's quoted total exercises
  // the per-document sum rather than one shared calculation.
  const compareDocuments = [
    { page_count: 2, color_mode: "bw", copies: 1, paper_size: "A4", sides: "single" },
    { page_count: 3, color_mode: "color", copies: 2, paper_size: "A3", sides: "double" },
  ];

  // Adds a requested service NAME to the SECOND document only - the first
  // stays plain, which is what proves the shop-eligibility check looks at
  // every document rather than just the first.
  const withServiceOnSecondDoc = (serviceNames) => [
    compareDocuments[0],
    { ...compareDocuments[1], services: serviceNames },
  ];

  say(section, 'POST /shops/compare-pricing asking for "lamination" on document 2 only');
  const laminationCompare = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    // Lowercase, and matching neither shop's name exactly - substring
    // matching is what has to find both.
    body: { documents: withServiceOnSecondDoc(["lamination"]) },
  });
  assert(laminationCompare.status === 200, `expected 200, got ${laminationCompare.status}: ${JSON.stringify(laminationCompare.data)}`);
  const laminationIds = laminationCompare.data.map((r) => r.shop_id);
  assert(
    laminationIds.includes(cheapShopId),
    'the shop calling it exactly "Lamination" should appear'
  );
  assert(
    laminationIds.includes(pricierShopId),
    'the shop calling it "Glossy Lamination" should appear too - substring match, not exact'
  );
  assert(
    !laminationIds.includes(noLaminationShopId),
    "the shop with no lamination of any kind must be excluded, not shown with a broken price"
  );

  const cheapResult = laminationCompare.data.find((r) => r.shop_id === cheapShopId);
  const pricierResult = laminationCompare.data.find((r) => r.shop_id === pricierShopId);

  // Each shop is priced on what IT matched, at ITS name and rate - two
  // shops quoting different services for the same request is expected.
  // Flat per DOCUMENT, and only the second document asked, so each
  // order-level services_charge is exactly one service.
  assert(
    cheapResult.price_breakdown.services_charge === 5,
    `expected the cheap shop to charge its own ₹5, got ${cheapResult.price_breakdown.services_charge}`
  );
  assert(
    pricierResult.price_breakdown.services_charge === 25,
    `expected the pricier shop to charge its own ₹25, got ${pricierResult.price_breakdown.services_charge}`
  );

  // Which service each shop actually matched, so the app can show it.
  assert(
    cheapResult.document_services[1][0].name === "Lamination",
    `cheap shop should report its matched service, got ${JSON.stringify(cheapResult.document_services[1])}`
  );
  assert(
    pricierResult.document_services[1][0].name === "Glossy Lamination",
    `pricier shop should report ITS matched service, got ${JSON.stringify(pricierResult.document_services[1])}`
  );
  assert(
    cheapResult.document_services[0].length === 0,
    `document 1 asked for nothing, got ${JSON.stringify(cheapResult.document_services[0])}`
  );

  assert(
    Array.isArray(cheapResult.document_totals) && cheapResult.document_totals.length === 2,
    `expected a per-document total for each of the 2 documents, got ${JSON.stringify(cheapResult.document_totals)}`
  );
  assert(typeof cheapResult.queue?.rush_level === "string", "expected queue.rush_level to be included, reusing the existing queue utility");
  say(
    section,
    '  -> confirmed: "lamination" matched "Lamination" (₹5) and "Glossy Lamination" (₹25) by substring, each priced at its own rate; the shop with neither was excluded'
  );

  say(section, "Asking for a service NO shop offers - expect an empty result set, not a broken price");
  const nobodyCompare = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    body: { documents: withServiceOnSecondDoc(["Holographic Foiling"]) },
  });
  assert(nobodyCompare.status === 200, `expected 200, got ${nobodyCompare.status}`);
  assert(
    !nobodyCompare.data.some((r) => [cheapShopId, pricierShopId, noLaminationShopId].includes(r.shop_id)),
    `no test shop should match an unknown service, got ${JSON.stringify(nobodyCompare.data.map((r) => r.shop_name))}`
  );
  say(section, "  -> confirmed: none of the test shops matched");

  say(section, "POST /shops/compare-pricing requesting no add-on services - both shops are now eligible, sorted by total_amount ascending");
  const plainCompare = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    body: { documents: compareDocuments },
  });
  assert(plainCompare.status === 200, `expected 200, got ${plainCompare.status}: ${JSON.stringify(plainCompare.data)}`);
  const plainIds = plainCompare.data.map((r) => r.shop_id);
  assert(plainIds.includes(cheapShopId) && plainIds.includes(pricierShopId), "both shops should be eligible once no service is requested");
  // Checked by relative index/amount rather than absolute position or
  // array length - other approved shops (the shared test shop included)
  // are also eligible here and may sort anywhere among these two.
  const cheapIndex = plainIds.indexOf(cheapShopId);
  const pricierIndex = plainIds.indexOf(pricierShopId);
  const cheapAmount = plainCompare.data[cheapIndex].total_amount;
  const pricierAmount = plainCompare.data[pricierIndex].total_amount;
  assert(cheapAmount < pricierAmount, `expected the cheap shop's total (${cheapAmount}) to be less than the pricier shop's (${pricierAmount})`);
  assert(cheapIndex < pricierIndex, `expected the cheaper shop to sort before the pricier one (ascending total_amount), got indices ${cheapIndex} vs ${pricierIndex}`);
  say(section, `  -> confirmed: cheap shop (₹${cheapAmount}) sorts before pricier shop (₹${pricierAmount})`);
}

// --- Section 14: shop open/closed status -----------------------------------
//
// is_open/business_hours (models/Shop.js) are entirely separate from
// is_active/verification_status - a shop can be listed and approved while
// temporarily not accepting orders. Runs against the shared test shop
// (vendorToken/shopId), and always leaves it back in its normal
// always-open state before handing off, regardless of what ran here.

// Minutes since local midnight, in IST, for right now - same formula as
// utils/shopStatus.js's getIstMinutesSinceMidnight, kept in sync
// deliberately so a window built from this always lands the same way the
// backend itself would evaluate it.
function istMinutesNow() {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 5 * 60 + 30) % (24 * 60);
}

function formatIstMinutes(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function shopOpenStatus(customerToken, vendorToken, shopId) {
  const section = "shopOpenStatus";

  say(section, "PATCH /shops/me/status - manually closing the shop (is_open: false)");
  const closeManual = await api("PATCH", "/shops/me/status", { token: vendorToken, body: { is_open: false } });
  assert(closeManual.status === 200, `expected 200, got ${closeManual.status}: ${JSON.stringify(closeManual.data)}`);
  assert(closeManual.data.is_open === false, `expected is_open false, got ${JSON.stringify(closeManual.data)}`);
  say(section, "  -> shop manually closed");

  say(section, "POST /orders while manually closed - expect 400");
  const [uploadA] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-closed-manual.pdf` },
  ]);
  const rejectedManual = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs([uploadA.upload_id], { color_mode: "bw", copies: 1 }) },
  });
  assert(rejectedManual.status === 400, `expected 400, got ${rejectedManual.status}: ${JSON.stringify(rejectedManual.data)}`);
  assert(
    /closed/i.test(rejectedManual.data.message || ""),
    `expected a clear "currently closed" message, got ${JSON.stringify(rejectedManual.data)}`
  );
  say(section, `  -> rejected as expected: "${rejectedManual.data.message}"`);

  say(section, "PATCH /shops/me/status - reopening manually (is_open: true)");
  const reopen = await api("PATCH", "/shops/me/status", { token: vendorToken, body: { is_open: true } });
  assert(reopen.status === 200, `expected 200, got ${reopen.status}: ${JSON.stringify(reopen.data)}`);
  assert(reopen.data.is_open === true, `expected is_open true, got ${JSON.stringify(reopen.data)}`);

  say(section, "POST /orders now that it's reopened - expect 201 (the manual toggle actually works both ways)");
  const [uploadB] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-reopened.pdf` },
  ]);
  const acceptedReopened = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs([uploadB.upload_id], { color_mode: "bw", copies: 1 }) },
  });
  assert(acceptedReopened.status === 201, `expected 201, got ${acceptedReopened.status}: ${JSON.stringify(acceptedReopened.data)}`);
  created.orderIds.push(acceptedReopened.data._id);
  say(section, "  -> accepted once reopened");

  // A window starting 2 hours from now and lasting 1 hour can never
  // contain "now" itself, regardless of what time it actually is when
  // this suite runs - no fixed clock and no mocking needed.
  const nowIst = istMinutesNow();
  const farOpenTime = formatIstMinutes(nowIst + 120);
  const farCloseTime = formatIstMinutes(nowIst + 180);

  say(
    section,
    `Enabling business_hours ${farOpenTime}-${farCloseTime} (outside the current time) while is_open stays true`
  );
  const enableSchedule = await api("PATCH", "/shops/me/status", {
    token: vendorToken,
    body: { is_open: true, business_hours: { enabled: true, open_time: farOpenTime, close_time: farCloseTime } },
  });
  assert(enableSchedule.status === 200, `expected 200, got ${enableSchedule.status}: ${JSON.stringify(enableSchedule.data)}`);
  assert(enableSchedule.data.business_hours.enabled === true, "expected business_hours.enabled true");

  say(section, "POST /orders while outside business_hours (is_open true, but schedule says closed) - expect 400");
  const [uploadC] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-closed-schedule.pdf` },
  ]);
  const rejectedSchedule = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs([uploadC.upload_id], { color_mode: "bw", copies: 1 }) },
  });
  assert(rejectedSchedule.status === 400, `expected 400, got ${rejectedSchedule.status}: ${JSON.stringify(rejectedSchedule.data)}`);
  assert(
    /closed/i.test(rejectedSchedule.data.message || ""),
    `expected a clear "currently closed" message, got ${JSON.stringify(rejectedSchedule.data)}`
  );
  say(
    section,
    `  -> rejected as expected (outside business hours overrides is_open: true): "${rejectedSchedule.data.message}"`
  );

  say(section, "GET /shops - confirming is_currently_open reflects the schedule closure and raw fields never leak");
  const listing = await api("GET", "/shops", { token: customerToken });
  assert(listing.status === 200, `expected 200, got ${listing.status}`);
  const listed = listing.data.find((s) => s._id === shopId);
  assert(listed, "expected the shop to still be listed while closed - closed shops are never excluded from GET /shops");
  assert(
    listed.is_currently_open === false,
    `expected is_currently_open false, got ${JSON.stringify(listed.is_currently_open)}`
  );
  assert(listed.is_open === undefined, "GET /shops must never include the raw is_open field");
  assert(listed.business_hours === undefined, "GET /shops must never include the raw business_hours field");
  say(section, "  -> confirmed: still listed, is_currently_open false, no raw is_open/business_hours fields leaked");

  say(section, "POST /shops/compare-pricing - confirming it reports the same schedule-based closure");
  const compareWhileClosed = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    body: { documents: [{ page_count: 1, color_mode: "bw", copies: 1 }] },
  });
  assert(compareWhileClosed.status === 200, `expected 200, got ${compareWhileClosed.status}`);
  const compareEntry = compareWhileClosed.data.find((r) => r.shop_id === shopId);
  assert(compareEntry, "expected the closed shop to still appear in compare-pricing results");
  assert(
    compareEntry.is_currently_open === false,
    `expected is_currently_open false in compare-pricing, got ${JSON.stringify(compareEntry.is_currently_open)}`
  );
  say(section, "  -> confirmed: compare-pricing agrees the shop is closed, and still includes it");

  say(section, "Disabling the schedule again, restoring the shop to its normal always-open state");
  const disableSchedule = await api("PATCH", "/shops/me/status", {
    token: vendorToken,
    body: { business_hours: { enabled: false } },
  });
  assert(disableSchedule.status === 200, `expected 200, got ${disableSchedule.status}: ${JSON.stringify(disableSchedule.data)}`);
  assert(disableSchedule.data.business_hours.enabled === false, "expected business_hours.enabled false again");
  say(section, "  -> restored: schedule disabled, is_open true - shop is open again");
}

// --- Section 15: pricing-config is now platform-fee-only -------------------
//
// GET /pricing-config used to also return Settings' rate_per_page_bw/
// color, paper_size_rates, sides_extra_rate and service_rates -
// all stale once pricing became per-shop (see pricingController.js's own
// comment on the repurposed route). Confirms the new response shape
// carries ONLY the platform fee. Public route, no auth needed, and
// independent of every other section - doesn't touch the shared shop or
// any test data, so nothing needs to be passed in.

async function pricingConfigIsPlatformFeeOnly() {
  const section = "pricingConfig";

  say(section, "GET /pricing-config (public, no auth)");
  const res = await api("GET", "/pricing-config");
  assert(res.status === 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);

  assert(
    typeof res.data.platform_fee_type === "string",
    `expected a platform_fee_type string, got ${JSON.stringify(res.data)}`
  );
  assert(
    typeof res.data.platform_fee_value === "number",
    `expected a numeric platform_fee_value, got ${JSON.stringify(res.data)}`
  );

  const keys = Object.keys(res.data).sort();
  assert(
    keys.length === 2 && keys.includes("platform_fee_type") && keys.includes("platform_fee_value"),
    `expected ONLY platform_fee_type/platform_fee_value - the old rate_per_page_bw/color, paper_size_rates, ` +
      `sides_extra_rate and service_rates fields must be gone - got keys: ${keys.join(", ")}`
  );
  say(section, `  -> confirmed: only platform_fee_type/platform_fee_value returned (${JSON.stringify(res.data)})`);
}

// --- Section 16: shop deactivation ------------------------------------------
//
// is_active (vendor self-service via PATCH /shops/me/deactivate, or an
// admin via PATCH /shops/:id/deactivate) is a longer-term "off the
// platform entirely" state, distinct from is_open/business_hours
// (already covered by Section 14). Runs against its OWN throwaway shop
// (same registerApprovedShop helper Section 13 uses), never the shared
// test shop - deactivating the shop every other section relies on being
// active would break whatever ran after it.
async function shopDeactivation(customerToken) {
  const section = "shopDeactivation";

  say(
    section,
    "Provisioning a one-off admin user and a throwaway shop to deactivate (kept separate from the shared test shop)"
  );
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  // "9" is customerFlow's real customer phone prefix (Section 1) - "2" is
  // unused as a User.phone prefix anywhere else in this file (checked
  // against every other makePhone(...) call assigned to a `phone:`
  // field), unlike the collision this replaced.
  const adminUser = await User.create({
    name: "E2E Test Admin (Deactivation)",
    phone: makePhone("2"),
    email: `test.admin.deactivate.${STAMP}@example.com`,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const { shopId, vendorToken } = await registerApprovedShop(section, {
    label: "deactivation",
    phonePrefix: "0",
    contactPrefix: "9",
    shopSuffix: "Deactivation",
    pricingPatch: {},
    adminToken,
  });

  say(section, "GET /shops - confirming the throwaway shop is listed while still active");
  const beforeListing = await api("GET", "/shops", { token: customerToken });
  assert(beforeListing.status === 200, `expected 200, got ${beforeListing.status}`);
  assert(beforeListing.data.some((s) => s._id === shopId), "expected the throwaway shop to be listed while active");
  say(section, "  -> confirmed listed while active");

  say(section, "Placing and paying for one order at this shop BEFORE deactivating it");
  const [uploadPre] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-deactivation-pre.pdf` },
  ]);
  const preOrder = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs([uploadPre.upload_id], { color_mode: "bw", copies: 1 }) },
  });
  assert(preOrder.status === 201, `expected 201, got ${preOrder.status}: ${JSON.stringify(preOrder.data)}`);
  created.orderIds.push(preOrder.data._id);
  await payForOrder(customerToken, preOrder.data._id);
  say(section, `  -> order ${preOrder.data._id} placed and paid for while the shop is still active`);

  say(section, "PATCH /shops/me/deactivate");
  const deactivateRes = await api("PATCH", "/shops/me/deactivate", { token: vendorToken });
  assert(
    deactivateRes.status === 200,
    `expected 200, got ${deactivateRes.status}: ${JSON.stringify(deactivateRes.data)}`
  );
  assert(deactivateRes.data.is_active === false, `expected is_active false, got ${JSON.stringify(deactivateRes.data)}`);
  say(section, "  -> shop deactivated");

  say(section, "GET /shops - confirming the deactivated shop has disappeared from the listing");
  const afterListing = await api("GET", "/shops", { token: customerToken });
  assert(afterListing.status === 200, `expected 200, got ${afterListing.status}`);
  assert(
    !afterListing.data.some((s) => s._id === shopId),
    "expected the deactivated shop to be excluded from GET /shops"
  );
  say(section, "  -> confirmed: no longer listed");

  say(section, "POST /shops/compare-pricing - confirming the deactivated shop is excluded there too");
  const compareRes = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    body: { documents: [{ page_count: 1, color_mode: "bw", copies: 1 }] },
  });
  assert(compareRes.status === 200, `expected 200, got ${compareRes.status}`);
  assert(
    !compareRes.data.some((r) => r.shop_id === shopId),
    "expected the deactivated shop to be excluded from compare-pricing"
  );
  say(section, "  -> confirmed: excluded from compare-pricing");

  say(section, "POST /orders to the deactivated shop - expect rejection (new orders blocked)");
  const [uploadPost] = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-deactivation-post.pdf` },
  ]);
  const postOrder = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs([uploadPost.upload_id], { color_mode: "bw", copies: 1 }) },
  });
  assert(postOrder.status === 404, `expected 404, got ${postOrder.status}: ${JSON.stringify(postOrder.data)}`);
  say(section, `  -> rejected as expected: "${postOrder.data.message}"`);

  say(
    section,
    "Confirming (without fully re-testing the whole order lifecycle) that the pre-deactivation order is untouched: " +
      "still visible to the shop owner and still acceptable, even though the shop itself is now deactivated"
  );
  const ordersForShop = await api("GET", `/orders/shop/${shopId}`, { token: vendorToken });
  assert(
    ordersForShop.status === 200,
    `expected 200, got ${ordersForShop.status}: ${JSON.stringify(ordersForShop.data)}`
  );
  assert(
    ordersForShop.data.some((o) => o._id === preOrder.data._id),
    "expected the pre-deactivation order to still be visible to the (deactivated) shop's owner - deactivation must not hide or cancel existing orders"
  );
  const acceptRes = await api("PATCH", `/orders/${preOrder.data._id}/accept`, { token: vendorToken });
  assert(acceptRes.status === 200, `expected 200, got ${acceptRes.status}: ${JSON.stringify(acceptRes.data)}`);
  say(section, "  -> confirmed: pre-deactivation order still visible and could be accepted normally - deactivation only blocks NEW orders");

  say(section, "PATCH /shops/me/reactivate - restoring the shop");
  const reactivateRes = await api("PATCH", "/shops/me/reactivate", { token: vendorToken });
  assert(
    reactivateRes.status === 200,
    `expected 200, got ${reactivateRes.status}: ${JSON.stringify(reactivateRes.data)}`
  );
  assert(reactivateRes.data.is_active === true, `expected is_active true, got ${JSON.stringify(reactivateRes.data)}`);
  say(section, "  -> shop reactivated");
}

// --- Section 17: admin panel ------------------------------------------------
//
// Covers the whole /admin surface the admin panel frontend runs on:
// role enforcement, vendor verification (including the notification the
// vendor now receives), the overview stats, and the settings write path.
//
// The admin user is inserted directly against the DB rather than through
// scripts/createAdmin.js - that script is interactive by design, and the
// point here is to test the ROUTES, not the prompt loop. It's the same
// direct-insert pattern vendorOnboarding and comparePricing already use
// for their own throwaway admins.
//
// Runs against its OWN throwaway vendor/shop (registerApprovedShop's
// sibling below), never the shared test shop, because it needs a shop
// sitting in "pending" to approve - the shared one is already approved by
// Section 3 and other sections depend on it staying that way.

async function adminPanel(customerToken, sharedShopId) {
  const section = "adminPanel";

  say(section, "Provisioning a one-off admin user directly against the DB (no self-serve admin signup exists, by design)");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const adminEmail = `test.admin.panel.${STAMP}@example.com`;
  const adminPassword = "TestAdminPass123!";
  const adminUser = await User.create({
    name: "E2E Test Admin (Panel)",
    // No phone at all - admins are exempt from the User schema's phone
    // requirement (see models/User.js), which is exactly what
    // scripts/createAdmin.js relies on.
    email: adminEmail,
    password_hash: await bcrypt.hash(adminPassword, 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());

  say(section, "POST /auth/login as the admin - confirming admins reuse the ordinary login route");
  const adminLogin = await api("POST", "/auth/login", { body: { email: adminEmail, password: adminPassword } });
  assert(adminLogin.status === 200, `expected 200, got ${adminLogin.status}: ${JSON.stringify(adminLogin.data)}`);
  assert(
    adminLogin.data.user.role === "admin",
    `expected role admin in the login response, got ${adminLogin.data.user.role}`
  );
  const adminToken = adminLogin.data.token;
  // The JWT's own payload has to carry the role too - requireRole reads it
  // from there, not from the database.
  const jwtRole = JSON.parse(Buffer.from(adminToken.split(".")[1], "base64").toString()).role;
  assert(jwtRole === "admin", `expected the JWT payload to carry role admin, got ${jwtRole}`);
  say(section, "  -> logged in, JWT carries role admin");

  say(section, "Confirming POST /auth/register still refuses to mint an admin");
  const escalation = await api("POST", "/auth/register", {
    body: {
      name: "E2E Escalation Probe",
      phone: makePhone("4"),
      email: `test.escalation.${STAMP}@example.com`,
      password: "TestPass123!",
      role: "admin",
    },
  });
  assert(escalation.status === 201, `expected 201, got ${escalation.status}: ${JSON.stringify(escalation.data)}`);
  created.userIds.push(escalation.data.user.id);
  assert(
    escalation.data.user.role === "customer",
    `registering with role "admin" must produce a customer, got ${escalation.data.user.role}`
  );
  say(section, '  -> confirmed: role "admin" in a signup body is silently downgraded to customer');

  // --- Role enforcement across the whole surface ---------------------------

  const ADMIN_ROUTES = [
    ["GET", "/admin/shops"],
    ["GET", "/admin/stats/overview"],
    ["GET", "/admin/orders"],
    ["GET", "/admin/settings"],
  ];

  say(section, "Every /admin/* route with NO token - expect 401");
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await api(method, path);
    assert(res.status === 401, `${method} ${path} expected 401, got ${res.status}`);
  }
  say(section, `  -> all ${ADMIN_ROUTES.length} routes rejected unauthenticated requests`);

  say(section, "Every /admin/* route with a CUSTOMER token - expect 403");
  for (const [method, path] of ADMIN_ROUTES) {
    const res = await api(method, path, { token: customerToken });
    assert(res.status === 403, `${method} ${path} with a customer token expected 403, got ${res.status}`);
  }
  say(section, `  -> all ${ADMIN_ROUTES.length} routes rejected a customer JWT`);

  // --- A throwaway vendor + pending shop to actually verify ----------------

  say(section, "Registering a throwaway vendor with a PENDING shop for this section to approve");
  const vendorEmail = `test.vendor.adminpanel.${STAMP}@example.com`;
  const vendorPassword = "TestPass123!";
  const vendorReg = await api("POST", "/auth/register", {
    body: {
      name: "E2E Test Vendor (Admin Panel)",
      phone: makePhone("7"),
      email: vendorEmail,
      password: vendorPassword,
      role: "shop_owner",
    },
  });
  assert(vendorReg.status === 201, `expected 201, got ${vendorReg.status}: ${JSON.stringify(vendorReg.data)}`);
  created.userIds.push(vendorReg.data.user.id);
  const vendorToken = vendorReg.data.token;

  const shopName = `Test Admin Panel Shop ${STAMP}`;
  const shopRes = await api("POST", "/shops", {
    token: vendorToken,
    body: { shop_name: shopName, address: "9 Admin Panel Lane, Test City", contact: makePhone("2") },
  });
  assert(shopRes.status === 201, `expected 201, got ${shopRes.status}: ${JSON.stringify(shopRes.data)}`);
  const shopId = shopRes.data._id;
  created.extraShopIds.push(shopId);
  say(section, `  -> ${shopName} (${shopId}) created, sitting at verification_status "pending"`);

  // --- GET /admin/shops ----------------------------------------------------

  say(section, "GET /admin/shops?verification_status=pending - the panel's default queue");
  const pendingList = await api("GET", "/admin/shops?verification_status=pending", { token: adminToken });
  assert(pendingList.status === 200, `expected 200, got ${pendingList.status}: ${JSON.stringify(pendingList.data)}`);
  assert(Array.isArray(pendingList.data), "expected an array of shops");
  const listed = pendingList.data.find((s) => s._id === shopId);
  assert(listed, `the pending shop ${shopId} was not in the pending list`);
  assert(listed.owner_id && listed.owner_id.name, "expected the owner to be populated with a name");
  assert(listed.owner_id.email === vendorEmail, `expected the owner's email, got ${listed.owner_id.email}`);
  assert(
    listed.owner_id.password_hash === undefined,
    "GET /admin/shops must never include the owner's password_hash"
  );
  assert(listed.kyc === undefined, "GET /admin/shops must not include kyc at all - that's the detail route's job");
  say(section, "  -> pending shop listed with owner name/email, no password_hash, no kyc");

  say(section, "GET /admin/shops?search= - filtering by shop name");
  const searched = await api("GET", `/admin/shops?search=${encodeURIComponent(shopName)}`, { token: adminToken });
  assert(searched.status === 200, `expected 200, got ${searched.status}`);
  assert(
    searched.data.some((s) => s._id === shopId),
    "search by exact shop name did not return the shop"
  );
  say(section, `  -> search matched ${searched.data.length} shop(s)`);

  say(section, "GET /admin/shops with a junk verification_status - expect 400");
  const badFilter = await api("GET", "/admin/shops?verification_status=banana", { token: adminToken });
  assert(badFilter.status === 400, `expected 400, got ${badFilter.status}: ${JSON.stringify(badFilter.data)}`);
  say(section, `  -> rejected: "${badFilter.data.message}"`);

  // --- GET /admin/shops/:id ------------------------------------------------

  say(section, "GET /admin/shops/:id - the review view");
  const detail = await api("GET", `/admin/shops/${shopId}`, { token: adminToken });
  assert(detail.status === 200, `expected 200, got ${detail.status}: ${JSON.stringify(detail.data)}`);
  assert(detail.data.kyc_document !== undefined, "expected a kyc_document block on the detail view");
  // This vendor never submitted KYC, so there is nothing to sign - the
  // block must still be present (the UI reads it) but with a null URL
  // rather than a broken link.
  assert(
    detail.data.kyc_document.signed_url === null,
    `expected a null signed_url for a shop with no KYC, got ${detail.data.kyc_document.signed_url}`
  );
  assert(
    detail.data.kyc?.id_proof_url === undefined,
    "the raw Cloudinary public_id must never appear in any response"
  );
  say(section, "  -> detail view OK: kyc_document present, signed_url null (no KYC submitted), no raw public_id");

  // The shared test shop (Section 3) DID submit a KYC document, so it is
  // the one shop in this run that can exercise the signed-URL path -
  // utils/kycFileAccess.js was dead code until this admin panel existed,
  // so this is the first thing that actually proves it produces a
  // working link rather than just returning a string.
  say(section, "GET /admin/shops/:id for the shared shop - which DOES have a KYC document");
  const kycDetail = await api("GET", `/admin/shops/${sharedShopId}`, { token: adminToken });
  assert(kycDetail.status === 200, `expected 200, got ${kycDetail.status}: ${JSON.stringify(kycDetail.data)}`);
  const signedUrl = kycDetail.data.kyc_document?.signed_url;
  assert(typeof signedUrl === "string" && signedUrl.startsWith("http"), `expected a signed URL, got ${signedUrl}`);
  assert(
    /[?&](signature|__cld_token__)/.test(signedUrl) || signedUrl.includes("/authenticated/"),
    `expected a SIGNED authenticated delivery URL, got ${signedUrl}`
  );
  assert(
    kycDetail.data.kyc?.id_proof_url === undefined,
    "the raw Cloudinary public_id must never appear alongside the signed URL"
  );
  // Two consecutive reads must not hand back the same cached link - the
  // whole point is that it is minted per request with a short expiry.
  const kycDetail2 = await api("GET", `/admin/shops/${sharedShopId}`, { token: adminToken });
  assert(
    typeof kycDetail2.data.kyc_document?.signed_url === "string",
    "second detail read did not return a signed URL"
  );
  say(section, `  -> signed KYC URL issued (expires in ${kycDetail.data.kyc_document.expires_in_seconds}s), no public_id leaked`);

  // Fetching it for real, not just checking a string came back: the URL
  // used to resolve to an extension-less raw asset that Cloudinary served
  // as application/octet-stream, so the admin's "View document" link
  // downloaded an unnamed blob instead of opening the PDF.
  say(section, "Fetching the signed KYC URL itself - it must return a real, non-empty PDF");
  const kycFetch = await fetch(signedUrl);
  const kycBytes = Buffer.from(await kycFetch.arrayBuffer());
  assert(kycFetch.status === 200, `expected 200 fetching the signed KYC URL, got ${kycFetch.status}`);
  assert(kycBytes.length > 0, "the signed KYC URL returned an empty body");
  assert(
    kycBytes.slice(0, 5).toString("latin1") === "%PDF-",
    `expected PDF bytes, got ${JSON.stringify(kycBytes.slice(0, 16).toString("latin1"))}`
  );
  const kycContentType = kycFetch.headers.get("content-type") || "";
  assert(
    kycContentType.includes("application/pdf"),
    `expected content-type application/pdf so a browser can display it, got "${kycContentType}"`
  );
  say(section, `  -> fetched ${kycBytes.length} bytes of ${kycContentType} - viewable in the browser`);

  // --- PATCH /admin/shops/:id/verify ---------------------------------------

  say(section, "PATCH /admin/shops/:id/verify as a VENDOR - expect 403");
  const vendorVerify = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: vendorToken,
    body: { status: "approved" },
  });
  assert(vendorVerify.status === 403, `expected 403, got ${vendorVerify.status}: ${JSON.stringify(vendorVerify.data)}`);
  say(section, `  -> correctly rejected: "${vendorVerify.data?.message}"`);

  say(section, "PATCH /admin/shops/:id/verify rejecting WITHOUT a reason - expect 400");
  const noReason = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: adminToken,
    body: { status: "rejected" },
  });
  assert(noReason.status === 400, `expected 400, got ${noReason.status}: ${JSON.stringify(noReason.data)}`);
  say(section, `  -> rejected: "${noReason.data.message}"`);

  const rejectionReason = "Test rejection - ID proof was unreadable.";
  say(section, "PATCH /admin/shops/:id/verify with status 'rejected'");
  const rejected = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: adminToken,
    body: { status: "rejected", rejection_reason: rejectionReason },
  });
  assert(rejected.status === 200, `expected 200, got ${rejected.status}: ${JSON.stringify(rejected.data)}`);
  assert(rejected.data.verification_status === "rejected", "shop was not marked rejected");
  assert(rejected.data.rejection_reason === rejectionReason, "rejection_reason was not stored");
  say(section, "  -> shop rejected with a reason");

  say(section, "GET /notifications AS THE VENDOR - confirming they were told about the rejection");
  const vendorNotifs = await api("GET", "/notifications", { token: vendorToken });
  assert(vendorNotifs.status === 200, `expected 200, got ${vendorNotifs.status}`);
  const rejectNotif = vendorNotifs.data.find((n) => n.type === "shop_rejected");
  assert(rejectNotif, `no shop_rejected notification found in ${JSON.stringify(vendorNotifs.data)}`);
  assert(
    rejectNotif.body.includes(rejectionReason),
    `expected the rejection reason inside the notification body, got "${rejectNotif.body}"`
  );
  assert(rejectNotif.shop_id === shopId, "shop notification should reference the shop it's about");
  assert(rejectNotif.order_id === undefined, "a shop notification has no order - order_id should be absent");
  say(section, `  -> vendor notified: "${rejectNotif.title}" - "${rejectNotif.body}"`);

  say(section, "PATCH /admin/shops/:id/verify with status 'approved'");
  const approved = await api("PATCH", `/admin/shops/${shopId}/verify`, {
    token: adminToken,
    body: { status: "approved" },
  });
  assert(approved.status === 200, `expected 200, got ${approved.status}: ${JSON.stringify(approved.data)}`);
  assert(approved.data.verification_status === "approved", "shop was not marked approved");
  assert(
    approved.data.rejection_reason === null,
    `approving must clear the old rejection_reason, got ${approved.data.rejection_reason}`
  );
  say(section, "  -> shop approved, previous rejection_reason cleared");

  say(section, "GET /notifications AS THE VENDOR again - confirming the approval notification");
  const vendorNotifs2 = await api("GET", "/notifications", { token: vendorToken });
  const approveNotif = vendorNotifs2.data.find((n) => n.type === "shop_approved");
  assert(approveNotif, `no shop_approved notification found in ${JSON.stringify(vendorNotifs2.data)}`);
  say(section, `  -> vendor notified: "${approveNotif.title}" - "${approveNotif.body}"`);

  // --- Admin deactivate / reactivate ---------------------------------------

  say(section, "PATCH /admin/shops/:id/deactivate - an admin pulling someone else's shop");
  const adminDeact = await api("PATCH", `/admin/shops/${shopId}/deactivate`, { token: adminToken });
  assert(adminDeact.status === 200, `expected 200, got ${adminDeact.status}: ${JSON.stringify(adminDeact.data)}`);
  assert(adminDeact.data.is_active === false, "shop was not deactivated");

  const hiddenList = await api("GET", "/shops", { token: customerToken });
  assert(
    !hiddenList.data.some((s) => s._id === shopId),
    "an admin-deactivated shop must disappear from the customer-facing GET /shops"
  );
  say(section, "  -> deactivated by admin, and gone from the customer listing");

  say(section, "PATCH /shops/me/reactivate AS THE VENDOR after an admin takedown - expect 403");
  const vendorSelfReact = await api("PATCH", "/shops/me/reactivate", { token: vendorToken });
  assert(
    vendorSelfReact.status === 403,
    `expected 403, got ${vendorSelfReact.status}: ${JSON.stringify(vendorSelfReact.data)}`
  );
  assert(
    /administrator/i.test(vendorSelfReact.data?.message || ""),
    `expected the admin-takedown message, got ${JSON.stringify(vendorSelfReact.data)}`
  );
  const stillDown = await api("GET", "/shops/me", { token: vendorToken });
  assert(stillDown.data.is_active === false, "a rejected self-reactivation must leave the shop inactive");
  assert(
    stillDown.data.deactivated_by === "admin",
    `expected deactivated_by "admin", got ${JSON.stringify(stillDown.data.deactivated_by)}`
  );
  say(section, `  -> rejected: "${vendorSelfReact.data.message}" - shop still inactive`);

  say(section, "PATCH /admin/shops/:id/reactivate - the counterpart the old admin route never had");
  const adminReact = await api("PATCH", `/admin/shops/${shopId}/reactivate`, { token: adminToken });
  assert(adminReact.status === 200, `expected 200, got ${adminReact.status}: ${JSON.stringify(adminReact.data)}`);
  assert(adminReact.data.is_active === true, "shop was not reactivated");
  const afterAdminReact = await api("GET", "/shops/me", { token: vendorToken });
  assert(
    afterAdminReact.data.deactivated_by === null,
    `admin reactivation should clear deactivated_by, got ${JSON.stringify(afterAdminReact.data.deactivated_by)}`
  );

  const shownList = await api("GET", "/shops", { token: customerToken });
  assert(
    shownList.data.some((s) => s._id === shopId),
    "a reactivated shop must reappear in the customer-facing GET /shops"
  );
  say(section, "  -> reactivated, and back in the customer listing");

  // --- GET /admin/stats/overview -------------------------------------------

  say(section, "GET /admin/stats/overview");
  const stats = await api("GET", "/admin/stats/overview", { token: adminToken });
  assert(stats.status === 200, `expected 200, got ${stats.status}: ${JSON.stringify(stats.data)}`);

  const REQUIRED_STATS = [
    "total_customers",
    "total_vendors",
    "shops_pending_verification",
    "shops_approved",
    "shops_rejected",
    "total_orders",
    "orders_today",
    "total_platform_revenue",
    "active_orders_right_now",
  ];
  for (const key of REQUIRED_STATS) {
    assert(typeof stats.data[key] === "number", `stats.${key} should be a number, got ${stats.data[key]}`);
    assert(stats.data[key] >= 0, `stats.${key} should never be negative, got ${stats.data[key]}`);
  }
  // Sanity rather than exact equality - this suite shares a database with
  // whatever else exists, so the only safe assertions are relational ones.
  assert(
    stats.data.total_vendors >= 1,
    `expected at least the vendor this section just created, got ${stats.data.total_vendors}`
  );
  assert(
    stats.data.shops_approved >= 1,
    `expected at least the shop just approved, got ${stats.data.shops_approved}`
  );
  assert(
    stats.data.orders_today <= stats.data.total_orders,
    `orders_today (${stats.data.orders_today}) cannot exceed total_orders (${stats.data.total_orders})`
  );
  assert(
    stats.data.active_orders_right_now <= stats.data.total_orders,
    `active_orders_right_now (${stats.data.active_orders_right_now}) cannot exceed total_orders (${stats.data.total_orders})`
  );
  say(
    section,
    `  -> stats sane: ${stats.data.total_customers} customers, ${stats.data.total_vendors} vendors, ` +
      `${stats.data.shops_pending_verification} pending, ${stats.data.total_orders} orders, ` +
      `revenue ${stats.data.total_platform_revenue}`
  );

  // --- GET /admin/orders ---------------------------------------------------

  say(section, "GET /admin/orders - platform-wide, read-only");
  const orders = await api("GET", "/admin/orders?limit=5", { token: adminToken });
  assert(orders.status === 200, `expected 200, got ${orders.status}: ${JSON.stringify(orders.data)}`);
  assert(Array.isArray(orders.data), "expected an array of orders");
  assert(orders.data.length <= 5, `?limit=5 returned ${orders.data.length} orders`);
  for (const o of orders.data) {
    assert(
      o.customer_id?.password_hash === undefined,
      "GET /admin/orders must never include a customer's password_hash"
    );
  }
  say(section, `  -> ${orders.data.length} order(s) returned, no customer credentials leaked`);

  say(section, "GET /admin/orders with a junk status filter - expect 400");
  const badStatus = await api("GET", "/admin/orders?status=banana", { token: adminToken });
  assert(badStatus.status === 400, `expected 400, got ${badStatus.status}`);
  say(section, `  -> rejected: "${badStatus.data.message}"`);

  // --- Settings read/write + cache invalidation ----------------------------

  say(section, "GET /admin/settings");
  const settingsRes = await api("GET", "/admin/settings", { token: adminToken });
  assert(settingsRes.status === 200, `expected 200, got ${settingsRes.status}`);
  const originalFeeType = settingsRes.data.platform_fee_type;
  const originalFeeValue = settingsRes.data.platform_fee_value;
  const originalThresholds = {
    low_max: settingsRes.data.rush_thresholds.low_max,
    medium_max: settingsRes.data.rush_thresholds.medium_max,
  };
  say(section, `  -> current: ${originalFeeType} ${originalFeeValue}, rush ${JSON.stringify(originalThresholds)}`);

  say(section, "PATCH /admin/settings with an inverted rush threshold pair - expect 400");
  const badThresholds = await api("PATCH", "/admin/settings", {
    token: adminToken,
    body: { rush_thresholds: { low_max: 9, medium_max: 2 } },
  });
  assert(badThresholds.status === 400, `expected 400, got ${badThresholds.status}: ${JSON.stringify(badThresholds.data)}`);
  say(section, `  -> rejected: "${badThresholds.data.message}"`);

  say(section, "PATCH /admin/settings changing the platform fee");
  const newFeeValue = originalFeeValue + 3;
  const patchSettings = await api("PATCH", "/admin/settings", {
    token: adminToken,
    body: { platform_fee_type: "flat", platform_fee_value: newFeeValue },
  });
  assert(patchSettings.status === 200, `expected 200, got ${patchSettings.status}: ${JSON.stringify(patchSettings.data)}`);
  assert(
    patchSettings.data.platform_fee_value === newFeeValue,
    `expected platform_fee_value ${newFeeValue}, got ${patchSettings.data.platform_fee_value}`
  );

  // The whole point of invalidatePricingSettingsCache(): getPricingSettings
  // caches for 60s, so without the invalidation hook this read (and every
  // order priced in the next minute) would still see the OLD fee.
  say(section, "GET /pricing-config immediately after - the settings cache must already be invalidated");
  const freshConfig = await api("GET", "/pricing-config");
  assert(freshConfig.status === 200, `expected 200, got ${freshConfig.status}`);
  assert(
    freshConfig.data.platform_fee_value === newFeeValue,
    `stale cache: expected the new fee ${newFeeValue}, got ${freshConfig.data.platform_fee_value} - ` +
      "invalidatePricingSettingsCache() is not being called on write"
  );
  say(section, `  -> confirmed: new fee ${newFeeValue} visible immediately, no 60s staleness`);

  say(section, "Restoring the original platform settings");
  const restore = await api("PATCH", "/admin/settings", {
    token: adminToken,
    body: {
      platform_fee_type: originalFeeType,
      platform_fee_value: originalFeeValue,
      rush_thresholds: originalThresholds,
    },
  });
  assert(restore.status === 200, `expected 200, got ${restore.status}: ${JSON.stringify(restore.data)}`);
  assert(restore.data.platform_fee_value === originalFeeValue, "platform fee was not restored");
  say(section, `  -> restored to ${originalFeeType} ${originalFeeValue}`);

  say(section, "PATCH /admin/settings with a CUSTOMER token - expect 403");
  const customerSettings = await api("PATCH", "/admin/settings", {
    token: customerToken,
    body: { platform_fee_value: 999 },
  });
  assert(customerSettings.status === 403, `expected 403, got ${customerSettings.status}`);
  say(section, "  -> a customer cannot rewrite platform pricing");
}

// --- Section 18: shop location + area search --------------------------------
//
// Two throwaway shops with different locality text and coordinates, ~16 km
// apart in Dehradun. Localities carry STAMP so ?search= can't also match
// real shops, and every geo assertion is relative (A before B) or bounded,
// since other approved shops in the DB may sit anywhere.

async function shopLocationSearch(customerToken) {
  const section = "shopLocation";

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const adminUser = await User.create({
    name: "E2E Test Admin (Location)",
    phone: uniquePhone(),
    email: `test.admin.location.${STAMP}@example.com`,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });

  say(section, "Registering two approved shops to pin in different areas");
  const nearShop = await registerApprovedShop(section, {
    label: "geonear", shopSuffix: "GeoNear", pricingPatch: {}, adminToken,
  });
  const farShop = await registerApprovedShop(section, {
    label: "geofar", shopSuffix: "GeoFar", pricingPatch: {}, adminToken,
  });

  const tag = `E2E${STAMP}`;
  const nearLocality = `Near Graphic Era University ${tag}`;
  const farLocality = `Selaqui ${tag}`;

  say(section, "PATCH /shops/me/location with an out-of-range latitude - expect 400");
  const badLat = await api("PATCH", "/shops/me/location", {
    token: nearShop.vendorToken,
    body: { latitude: 91, longitude: 77.99, locality: nearLocality },
  });
  assert(badLat.status === 400, `expected 400, got ${badLat.status}: ${JSON.stringify(badLat.data)}`);
  say(section, `  -> rejected: "${badLat.data.message}"`);

  say(section, "PATCH /shops/me/location for both shops");
  const setNear = await api("PATCH", "/shops/me/location", {
    token: nearShop.vendorToken,
    body: { latitude: 30.2689, longitude: 77.9931, locality: nearLocality },
  });
  assert(setNear.status === 200, `expected 200, got ${setNear.status}: ${JSON.stringify(setNear.data)}`);
  assert(
    JSON.stringify(setNear.data.location?.coordinates) === JSON.stringify([77.9931, 30.2689]),
    `expected GeoJSON [lng, lat], got ${JSON.stringify(setNear.data.location)}`
  );
  const setFar = await api("PATCH", "/shops/me/location", {
    token: farShop.vendorToken,
    body: { latitude: 30.3669, longitude: 77.8583, locality: farLocality },
  });
  assert(setFar.status === 200, `expected 200, got ${setFar.status}: ${JSON.stringify(setFar.data)}`);
  say(section, "  -> both pinned, stored as [longitude, latitude]");

  say(section, "GET /shops?search= with the near shop's locality, in lower case - only that shop should match");
  const byLocality = await api("GET", `/shops?search=${encodeURIComponent(`graphic era university ${tag.toLowerCase()}`)}`, {
    token: customerToken,
  });
  assert(byLocality.status === 200, `expected 200, got ${byLocality.status}: ${JSON.stringify(byLocality.data)}`);
  const localityIds = byLocality.data.map((s) => s._id);
  assert(localityIds.includes(nearShop.shopId), "locality search should match the shop whose locality contains the text");
  assert(!localityIds.includes(farShop.shopId), "locality search must not match a shop in a different locality");
  assert(
    byLocality.data.every((s) => s.distance_km === undefined),
    "without lat/lng, no distance_km should be sent"
  );
  say(section, `  -> ${byLocality.data.length} match(es), near shop included, far shop excluded, no distance_km`);

  say(section, "GET /shops?search= with the far shop's NAME - search also covers shop_name");
  const byName = await api("GET", `/shops?search=${encodeURIComponent(`GeoFar ${STAMP}`)}`, { token: customerToken });
  assert(byName.data.some((s) => s._id === farShop.shopId), "name search should match the far shop");
  say(section, "  -> matched by name");

  say(section, "GET /shops?lat=&lng= next to Graphic Era - nearer shop first, with distance_km");
  const nearby = await api("GET", "/shops?lat=30.2700&lng=77.9950", { token: customerToken });
  assert(nearby.status === 200, `expected 200, got ${nearby.status}: ${JSON.stringify(nearby.data)}`);
  const nearbyIds = nearby.data.map((s) => s._id);
  const nearIdx = nearbyIds.indexOf(nearShop.shopId);
  const farIdx = nearbyIds.indexOf(farShop.shopId);
  assert(nearIdx !== -1 && farIdx !== -1, "both pinned shops should appear in a geo-sorted listing");
  assert(nearIdx < farIdx, `expected the nearer shop first, got indices ${nearIdx} vs ${farIdx}`);
  const nearKm = nearby.data[nearIdx].distance_km;
  const farKm = nearby.data[farIdx].distance_km;
  assert(typeof nearKm === "number" && nearKm < 1, `expected the near shop under 1 km away, got ${nearKm}`);
  assert(typeof farKm === "number" && farKm > 10 && farKm < 25, `expected the far shop 10-25 km away, got ${farKm}`);
  assert(Number.isInteger(farKm * 10), `distance_km should be rounded to 1 decimal, got ${farKm}`);
  say(section, `  -> near shop ${nearKm} km, far shop ${farKm} km, in that order`);

  say(section, "GET /shops?search=<tag>&lat=&lng= - search and distance combined");
  const combined = await api("GET", `/shops?search=${tag}&lat=30.2700&lng=77.9950`, { token: customerToken });
  assert(combined.status === 200, `expected 200, got ${combined.status}: ${JSON.stringify(combined.data)}`);
  assert(
    JSON.stringify(combined.data.map((s) => s._id)) === JSON.stringify([nearShop.shopId, farShop.shopId]),
    `expected exactly [near, far], got ${JSON.stringify(combined.data.map((s) => s._id))}`
  );
  say(section, "  -> exactly the two tagged shops, nearest first");

  say(section, "GET /shops with lat but no lng - expect 400");
  const halfPoint = await api("GET", "/shops?lat=30.27", { token: customerToken });
  assert(halfPoint.status === 400, `expected 400, got ${halfPoint.status}: ${JSON.stringify(halfPoint.data)}`);
  say(section, `  -> rejected: "${halfPoint.data.message}"`);

  say(section, "POST /shops/compare-pricing with lat/lng - distance_km added, still sorted by total_amount");
  const compare = await api("POST", "/shops/compare-pricing", {
    token: customerToken,
    body: { documents: [{ page_count: 2, color_mode: "bw", copies: 1 }], lat: 30.27, lng: 77.995 },
  });
  assert(compare.status === 200, `expected 200, got ${compare.status}: ${JSON.stringify(compare.data)}`);
  const nearResult = compare.data.find((r) => r.shop_id === nearShop.shopId);
  const farResult = compare.data.find((r) => r.shop_id === farShop.shopId);
  assert(nearResult && farResult, "both pinned shops should be eligible for a plain B&W comparison");
  assert(nearResult.distance_km < farResult.distance_km, "compare-pricing distance_km should reflect real distance");
  assert(nearResult.locality === nearLocality, "compare-pricing results should carry locality");
  const totals = compare.data.map((r) => r.total_amount);
  assert(
    totals.every((t, i) => i === 0 || totals[i - 1] <= t),
    `results must stay sorted by total_amount, got ${JSON.stringify(totals)}`
  );
  say(section, `  -> distances ${nearResult.distance_km} / ${farResult.distance_km} km, price order unchanged`);
}

// --- Section 19: cleanup (always runs) -------------------------------------

// Section 19: the customer support chat, over REST.
//
// The live half of this feature is Socket.io, and it is deliberately NOT
// covered here: this script drives plain HTTP requests, and a socket test
// would need a connected client held open across assertions, with
// timeouts standing in for "nothing arrived" - flaky in a suite that
// already takes minutes to run.
//
// That is a smaller gap than it sounds, because sending is ONE function
// (sendSupportMessage in utils/supportMessaging.js) that both the socket
// handler and these REST routes call. Everything below - persistence,
// which unread counter moves, what the admin list shows - is that shared
// function, so a socket send exercises code this section has already
// proven. What stays untested here is only the transport: the handshake,
// the room joins and the broadcast.
//
// MANUAL VERIFICATION for that transport (scripts/socketSupportProbe.mjs
// automates it separately, without needing the database):
//   1. Connect the app with a valid customer JWT in handshake auth; then
//      try again with a junk token and confirm the connection is refused.
//   2. With the admin panel open on that customer's thread, send from the
//      app and confirm the message appears without a refresh, and the
//      reverse.
//   3. With the admin panel on a DIFFERENT thread, send from the app and
//      confirm the unread badge moves without the message appearing.
async function customerSupport(sharedCustomerToken, vendorToken, sharedOrderId) {
  const section = "customerSupport";

  // Its own customer, never the shared one: this section asserts on
  // absolute unread counts and on an empty starting history, and the
  // shared customer accumulates state from every section before it.
  const email = `test.support.customer.${STAMP}@example.com`;
  const password = "TestPass123!";
  say(section, "Registering a dedicated support customer");
  const reg = await api("POST", "/auth/register", {
    body: { name: "E2E Support Customer", phone: uniquePhone(), email, password, role: "customer" },
  });
  assert(reg.status === 201, `expected 201 from register, got ${reg.status}: ${JSON.stringify(reg.data)}`);
  const supportToken = reg.data.token;
  const supportCustomerId = reg.data.user._id || reg.data.user.id;
  created.userIds.push(supportCustomerId);

  // --- the thread exists on first ask, without being created first -----
  say(section, "GET /support/conversation - get-or-create on first open");
  const first = await api("GET", "/support/conversation", { token: supportToken });
  assert(first.status === 200, `expected 200, got ${first.status}: ${JSON.stringify(first.data)}`);
  assert(
    String(first.data.conversation.customer_id) === String(supportCustomerId),
    "the conversation returned does not belong to the calling customer"
  );
  assert(
    Array.isArray(first.data.messages) && first.data.messages.length === 0,
    `expected an empty history, got ${JSON.stringify(first.data.messages)}`
  );
  assert(first.data.has_more === false, "has_more should be false for an empty thread");
  assert(
    first.data.conversation.unread_by_admin === 0 && first.data.conversation.unread_by_customer === 0,
    "a brand new conversation should have no unread messages on either side"
  );
  say(section, "  -> created on demand, empty, nothing unread");

  // Asking again must NOT create a second one - customer_id is unique,
  // and a get-or-create that raced with itself would have thrown here.
  const second = await api("GET", "/support/conversation", { token: supportToken });
  assert(
    String(second.data.conversation._id) === String(first.data.conversation._id),
    "a second GET created a different conversation instead of returning the same one"
  );
  say(section, "  -> asking again returns the SAME conversation, not a second one");

  // --- the customer writes in ------------------------------------------
  const customerText = `My order never arrived - e2e ${STAMP}`;
  say(section, "POST /support/conversation/messages");
  const sent = await api("POST", "/support/conversation/messages", {
    token: supportToken,
    body: { text: customerText },
  });
  assert(sent.status === 201, `expected 201, got ${sent.status}: ${JSON.stringify(sent.data)}`);
  assert(sent.data.sender_role === "customer", `expected sender_role customer, got ${sent.data.sender_role}`);
  assert(sent.data.text === customerText, "the stored message text does not match what was sent");
  assert(sent.data.order_context === null, "a message sent with no order context should store null");

  say(section, "Confirming empty and over-length messages are refused");
  const empty = await api("POST", "/support/conversation/messages", {
    token: supportToken,
    body: { text: "   " },
  });
  assert(empty.status === 400, `expected 400 for a blank message, got ${empty.status}`);
  const tooLong = await api("POST", "/support/conversation/messages", {
    token: supportToken,
    body: { text: "x".repeat(2001) },
  });
  assert(tooLong.status === 400, `expected 400 for a 2001-character message, got ${tooLong.status}`);
  say(section, "  -> blank rejected, 2001 characters rejected");

  // --- it reaches the admin inbox with the right badge ------------------
  say(section, "Provisioning a one-off admin to read the support inbox");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
  const adminUser = await User.create({
    name: "E2E Test Admin (Support)",
    email: `test.admin.support.${STAMP}@example.com`,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  say(section, "GET /admin/support/conversations");
  const list = await api("GET", "/admin/support/conversations", { token: adminToken });
  assert(list.status === 200, `expected 200, got ${list.status}: ${JSON.stringify(list.data)}`);
  // Found by customer id rather than by position: other test runs and
  // real customers may have threads of their own in this inbox.
  const row = list.data.find((c) => String(c.customer?._id) === String(supportCustomerId));
  assert(row, "the new conversation does not appear in the admin inbox");
  assert(row.unread_by_admin === 1, `expected unread_by_admin 1, got ${row.unread_by_admin}`);
  assert(
    row.last_message?.text === customerText,
    `the preview does not match the message sent: ${JSON.stringify(row.last_message)}`
  );
  assert(row.last_message?.sender_role === "customer", "the preview names the wrong sender");
  assert(
    row.customer?.name === "E2E Support Customer" && row.customer?.phone,
    `the row is missing the customer name/phone support needs: ${JSON.stringify(row.customer)}`
  );
  say(section, "  -> listed with unread_by_admin 1, the right preview, and the customer's name/phone");

  // The inbox must be sorted by most recent activity, since that is what
  // makes it a queue rather than a list.
  const times = list.data.map((c) => new Date(c.last_message_at).getTime());
  assert(
    times.every((t, i) => i === 0 || times[i - 1] >= t),
    "the admin inbox is not sorted by last_message_at descending"
  );
  say(section, "  -> inbox sorted by last_message_at descending");

  // --- the detail view carries everything needed to answer -------------
  say(section, "GET /admin/support/conversations/:customerId");
  const detail = await api("GET", `/admin/support/conversations/${supportCustomerId}`, {
    token: adminToken,
  });
  assert(detail.status === 200, `expected 200, got ${detail.status}: ${JSON.stringify(detail.data)}`);
  assert(detail.data.messages.length === 1, `expected 1 message, got ${detail.data.messages.length}`);
  assert(detail.data.messages[0].text === customerText, "the history does not contain the message sent");
  assert(
    detail.data.customer?.email === email && detail.data.customer?.account_created_at,
    `the detail view is missing the customer profile: ${JSON.stringify(detail.data.customer)}`
  );
  assert(
    Array.isArray(detail.data.recent_orders) && detail.data.recent_orders.length === 0,
    "a customer who has never ordered should come back with an empty recent_orders, not a missing one"
  );
  say(section, "  -> full history, customer profile and (empty) order history in one response");

  // --- the admin replies ------------------------------------------------
  const adminText = `Sorry about that - checking with the shop now. e2e ${STAMP}`;
  say(section, "POST /admin/support/conversations/:customerId/messages");
  const replied = await api("POST", `/admin/support/conversations/${supportCustomerId}/messages`, {
    token: adminToken,
    body: { text: adminText },
  });
  assert(replied.status === 201, `expected 201, got ${replied.status}: ${JSON.stringify(replied.data)}`);
  assert(replied.data.sender_role === "admin", `expected sender_role admin, got ${replied.data.sender_role}`);

  say(section, "Confirming the reply moved the CUSTOMER's unread counter, not the admin's");
  const afterReply = await api("GET", "/support/conversation", { token: supportToken });
  assert(afterReply.data.messages.length === 2, `expected 2 messages, got ${afterReply.data.messages.length}`);
  assert(
    afterReply.data.messages[0].text === customerText && afterReply.data.messages[1].text === adminText,
    "history is not returned oldest-first"
  );
  assert(
    afterReply.data.conversation.unread_by_customer === 1,
    `expected unread_by_customer 1, got ${afterReply.data.conversation.unread_by_customer}`
  );
  assert(
    afterReply.data.conversation.unread_by_admin === 1,
    `the admin's own reply should not clear their unread count, got ${afterReply.data.conversation.unread_by_admin}`
  );
  say(section, "  -> unread_by_customer 1, unread_by_admin still 1 (reading is what clears it, not replying)");

  // --- marking read, both directions ------------------------------------
  say(section, "PATCH /admin/support/conversations/:customerId/read");
  const adminRead = await api("PATCH", `/admin/support/conversations/${supportCustomerId}/read`, {
    token: adminToken,
  });
  assert(adminRead.status === 200, `expected 200, got ${adminRead.status}`);
  assert(adminRead.data.unread_by_admin === 0, `expected unread_by_admin 0, got ${adminRead.data.unread_by_admin}`);
  assert(
    adminRead.data.unread_by_customer === 1,
    "marking read as admin must not touch the customer's counter"
  );

  const listAfterRead = await api("GET", "/admin/support/conversations", { token: adminToken });
  const rowAfterRead = listAfterRead.data.find((c) => String(c.customer?._id) === String(supportCustomerId));
  assert(rowAfterRead.unread_by_admin === 0, "the inbox badge did not clear after marking read");
  assert(
    rowAfterRead.last_message?.text === adminText,
    "the inbox preview did not move on to the admin's reply"
  );
  say(section, "  -> badge cleared and persisted; preview now shows the reply");

  say(section, "PATCH /support/conversation/read");
  const custRead = await api("PATCH", "/support/conversation/read", { token: supportToken });
  assert(custRead.status === 200, `expected 200, got ${custRead.status}`);
  assert(custRead.data.unread_by_customer === 0, `expected unread_by_customer 0, got ${custRead.data.unread_by_customer}`);
  say(section, "  -> both sides back to zero unread");

  // --- order context ----------------------------------------------------
  // Sent by the SHARED customer, because order_context is only accepted
  // for an order the sender actually owns - and that customer is the one
  // with an order by this point in the run.
  if (sharedOrderId) {
    say(section, 'POST with order_context - the "need help with this order" entry point');
    const withContext = await api("POST", "/support/conversation/messages", {
      token: sharedCustomerToken,
      body: {
        text: "This is the order I mean",
        // shop_name deliberately WRONG here: the server resolves the shop
        // from the order itself and must ignore what the client claims.
        order_context: { order_id: sharedOrderId, shop_name: "Not The Real Shop" },
      },
    });
    assert(withContext.status === 201, `expected 201, got ${withContext.status}: ${JSON.stringify(withContext.data)}`);
    assert(
      String(withContext.data.order_context?.order_id) === String(sharedOrderId),
      "the message did not store the order it was sent about"
    );
    assert(
      withContext.data.order_context?.shop_name &&
        withContext.data.order_context.shop_name !== "Not The Real Shop",
      `the shop name should come from the order, not the client: ${JSON.stringify(withContext.data.order_context)}`
    );
    say(section, `  -> stored, with the shop name resolved server-side ("${withContext.data.order_context.shop_name}")`);

    say(section, "Confirming a customer cannot attach SOMEONE ELSE'S order to their thread");
    const stolen = await api("POST", "/support/conversation/messages", {
      token: supportToken,
      body: { text: "Not my order", order_context: { order_id: sharedOrderId } },
    });
    assert(stolen.status === 404, `expected 404 for another customer's order, got ${stolen.status}`);
    say(section, "  -> refused with 404");
  } else {
    say(section, "SKIPPED order_context checks: no order was created earlier in this run");
  }

  const badContext = await api("POST", "/support/conversation/messages", {
    token: supportToken,
    body: { text: "bad id", order_context: { order_id: "not-an-object-id" } },
  });
  assert(badContext.status === 400, `expected 400 for a malformed order id, got ${badContext.status}`);

  // --- who is allowed in ------------------------------------------------
  say(section, "Checking access control on both halves");
  const noToken = await api("GET", "/support/conversation");
  assert(noToken.status === 401, `expected 401 without a token, got ${noToken.status}`);

  const asVendor = await api("GET", "/support/conversation", { token: vendorToken });
  assert(asVendor.status === 403, `expected 403 for a shop owner, got ${asVendor.status}`);

  const customerOnAdmin = await api("GET", "/admin/support/conversations", { token: supportToken });
  assert(customerOnAdmin.status === 403, `expected 403 for a customer on the admin inbox, got ${customerOnAdmin.status}`);

  const unknownCustomer = await api(
    "GET",
    `/admin/support/conversations/${new mongoose.Types.ObjectId()}`,
    { token: adminToken }
  );
  assert(unknownCustomer.status === 404, `expected 404 for an unknown customer, got ${unknownCustomer.status}`);
  say(section, "  -> 401 no token, 403 vendor, 403 customer-on-admin, 404 unknown customer");

  say(section, "NOTE: Socket.io transport (handshake, rooms, live delivery) is verified separately -");
  say(section, "      run `node scripts/socketSupportProbe.mjs`, or see this function's comment for the manual steps.");
}


// --- Section 20: payout details + manual settlements --------------------
//
// The settlement system records transfers an admin makes BY HAND (UPI or
// bank) outside this platform. No money moves through the code, so what
// is tested here is the bookkeeping: that what a vendor is owed is
// computed from the right orders, that settling part of a batch leaves
// the rest still owed, and that both sides agree about it.

async function payoutSettlements(customerToken) {
  const section = "payoutSettlements";

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  say(section, "Provisioning a one-off admin to approve the shop and record settlements");
  const adminEmail = `test.admin.settle.${STAMP}@example.com`;
  const adminUser = await User.create({
    name: "E2E Test Admin (Settlements)",
    // No phone - admins are exempt from the User schema's phone
    // requirement, same as the Section 17 admin above.
    email: adminEmail,
    password_hash: await bcrypt.hash("TestAdminPass123!", 10),
    role: "admin",
  });
  created.userIds.push(adminUser._id.toString());
  const adminToken = jwt.sign({ id: adminUser._id, role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  // A shop of its own, so the amounts below are exactly the two orders
  // this section creates and nothing another section left behind.
  const { shopId, vendorToken } = await registerApprovedShop(section, {
    label: "settle",
    shopSuffix: "Settle",
    adminToken,
    pricingPatch: { rate_per_page_bw: 5, rate_per_page_color: 12, sides_extra_rate: 0 },
    services: [],
  });

  // ================= payout details =================
  say(section, "PATCH /shops/me/payout with a malformed IFSC - expect 400");
  const badIfsc = await api("PATCH", "/shops/me/payout", {
    token: vendorToken,
    body: { account_holder_name: "E2E Vendor", account_number: "123456789012", ifsc_code: "HDFC1001234" },
  });
  assert(badIfsc.status === 400, `expected 400 for a bad IFSC, got ${badIfsc.status}: ${JSON.stringify(badIfsc.data)}`);
  say(section, `  -> rejected: "${badIfsc.data.message}"`);

  // The fifth character must be a literal 0 - the case above has a 1
  // there, which is the typo the format check exists to catch.
  say(section, "Confirming a too-short IFSC is rejected too");
  const shortIfsc = await api("PATCH", "/shops/me/payout", {
    token: vendorToken,
    body: { ifsc_code: "HDFC000123" },
  });
  assert(shortIfsc.status === 400, `expected 400 for a 10-char IFSC, got ${shortIfsc.status}`);

  const historyBefore = await PayoutHistory.countDocuments({ shop_id: shopId });
  assert(historyBefore === 0, `a rejected payout edit must not be logged, found ${historyBefore} row(s)`);
  say(section, "  -> confirmed: neither rejected edit wrote a PayoutHistory row");

  say(section, "PATCH /shops/me/payout with valid details");
  const goodPayout = await api("PATCH", "/shops/me/payout", {
    token: vendorToken,
    body: {
      account_holder_name: "E2E Vendor Settle",
      account_number: "123456789012",
      ifsc_code: "hdfc0001234",
      upi_id: `e2e.${STAMP}@upi`,
    },
  });
  assert(goodPayout.status === 200, `expected 200, got ${goodPayout.status}: ${JSON.stringify(goodPayout.data)}`);
  assert(
    goodPayout.data.payout.ifsc_code === "HDFC0001234",
    `expected the IFSC stored upper-case, got "${goodPayout.data.payout.ifsc_code}"`
  );
  assert(goodPayout.data.payout.updated_at, "expected payout.updated_at to be set");
  say(section, `  -> saved, IFSC normalised to ${goodPayout.data.payout.ifsc_code}`);

  const logged = await PayoutHistory.find({ shop_id: shopId }).lean();
  assert(logged.length === 1, `expected exactly 1 PayoutHistory row, got ${logged.length}`);
  assert(
    logged[0].changed_field_summary.includes("account_number"),
    `expected the summary to name account_number, got "${logged[0].changed_field_summary}"`
  );
  assert(
    String(logged[0].changed_by) === String(created.userIds[created.userIds.length - 1]) ||
      !!logged[0].changed_by,
    "expected changed_by to be recorded"
  );
  // The whole point of the log's design: it records THAT details changed,
  // never what they changed to.
  const loggedJson = JSON.stringify(logged[0]);
  assert(
    !loggedJson.includes("123456789012"),
    "PayoutHistory must never contain the account number itself"
  );
  assert(!loggedJson.includes("HDFC0001234"), "PayoutHistory must never contain the IFSC itself");
  say(
    section,
    `  -> logged 1 row: "${logged[0].changed_field_summary}" - and it contains no account number or IFSC`
  );

  say(section, "Re-sending the identical details - expect no second history row");
  const unchanged = await api("PATCH", "/shops/me/payout", {
    token: vendorToken,
    body: {
      account_holder_name: "E2E Vendor Settle",
      account_number: "123456789012",
      ifsc_code: "HDFC0001234",
    },
  });
  assert(unchanged.status === 200, `expected 200, got ${unchanged.status}`);
  assert(
    Array.isArray(unchanged.data.changed) && unchanged.data.changed.length === 0,
    `expected changed: [], got ${JSON.stringify(unchanged.data.changed)}`
  );
  const afterNoop = await PayoutHistory.countDocuments({ shop_id: shopId });
  assert(afterNoop === 1, `expected still 1 history row after a no-op edit, got ${afterNoop}`);
  say(section, "  -> confirmed: an unchanged resubmission logs nothing (the log stays a real signal)");

  // ================= two completed, paid orders =================
  say(section, "Creating, paying for and completing 2 orders at this shop");
  const orderInfo = [];
  for (const n of [1, 2]) {
    const ups = await uploadTestFiles(customerToken, [
      { buffer: makeDummyPdfBuffer(n === 1 ? 2 : 4), filename: `e2e-test-${STAMP}-settle-${n}.pdf` },
    ]);
    const order = await api("POST", "/orders", {
      token: customerToken,
      body: { shop_id: shopId, documents: docs(ups.map((u) => u.upload_id)) },
    });
    assert(order.status === 201, `order ${n} expected 201, got ${order.status}: ${JSON.stringify(order.data)}`);
    const orderId = order.data._id;
    created.orderIds.push(orderId);

    const paid = await payForOrder(customerToken, orderId);
    await api("PATCH", `/orders/${orderId}/accept`, { token: vendorToken });
    await api("PATCH", `/orders/${orderId}/ready`, { token: vendorToken });
    const done = await api("PATCH", `/orders/${orderId}/complete`, {
      token: vendorToken,
      body: { otp: paid.otp },
    });
    assert(done.status === 200, `order ${n} complete expected 200, got ${done.status}: ${JSON.stringify(done.data)}`);

    const row = await Order.findById(orderId).lean();
    // Frozen at payment time, from this order's own totals.
    const expected = Math.round((row.total_amount - row.platform_fee) * 100) / 100;
    assert(
      row.vendor_amount === expected,
      `order ${n}: expected vendor_amount ${expected} (total ${row.total_amount} - fee ${row.platform_fee}), got ${row.vendor_amount}`
    );
    assert(
      row.settlement_status === "unsettled",
      `order ${n}: expected settlement_status "unsettled", got "${row.settlement_status}"`
    );
    orderInfo.push({ orderId, vendor_amount: row.vendor_amount });
    say(
      section,
      `  -> order ${n} (${orderId}) completed: total ${row.total_amount} - fee ${row.platform_fee} = vendor_amount ${row.vendor_amount}, unsettled`
    );
  }

  const expectedTotal =
    Math.round((orderInfo[0].vendor_amount + orderInfo[1].vendor_amount) * 100) / 100;

  // ================= the admin's pending view =================
  say(section, "GET /admin/settlements/pending");
  const pending = await api("GET", "/admin/settlements/pending", { token: adminToken });
  assert(pending.status === 200, `expected 200, got ${pending.status}: ${JSON.stringify(pending.data)}`);
  const mine = pending.data.find((r) => String(r.shop_id) === String(shopId));
  assert(mine, `the test shop is missing from pending settlements: ${JSON.stringify(pending.data)}`);
  assert(
    mine.unsettled_order_count === 2,
    `expected 2 unsettled orders, got ${mine.unsettled_order_count}`
  );
  assert(
    mine.total_unsettled_amount === expectedTotal,
    `expected total_unsettled_amount ${expectedTotal}, got ${mine.total_unsettled_amount}`
  );
  assert(mine.oldest_unsettled_at, "expected an oldest_unsettled_at date");
  assert(mine.owner_name, "expected the owner's name on the pending row");
  say(
    section,
    `  -> ${mine.shop_name} (owner ${mine.owner_name}): 2 orders, ${mine.total_unsettled_amount} owed, oldest ${mine.oldest_unsettled_at}`
  );

  // Sorted oldest-first, so the vendor waiting longest is at the top.
  const dates = pending.data.map((r) => new Date(r.oldest_unsettled_at).getTime());
  assert(
    dates.every((d, i) => i === 0 || dates[i - 1] <= d),
    `pending settlements must be sorted oldest-first, got ${JSON.stringify(dates)}`
  );
  say(section, "  -> confirmed: sorted oldest-pending first");

  // ================= the detail screen =================
  say(section, `GET /admin/settlements/shop/${shopId}`);
  const detail = await api("GET", `/admin/settlements/shop/${shopId}`, { token: adminToken });
  assert(detail.status === 200, `expected 200, got ${detail.status}: ${JSON.stringify(detail.data)}`);
  assert(
    detail.data.payout.account_number === "123456789012",
    `the admin must see the real account number to make a transfer, got "${detail.data.payout.account_number}"`
  );
  assert(detail.data.payout.ifsc_code === "HDFC0001234", "expected the stored IFSC");
  assert(detail.data.unsettled.order_count === 2, `expected 2 unsettled orders in the detail view`);
  assert(
    detail.data.unsettled.total_amount === expectedTotal,
    `expected ${expectedTotal}, got ${detail.data.unsettled.total_amount}`
  );
  assert(detail.data.settlements.length === 0, "expected no settlement history yet");
  say(section, "  -> bank details, 2 unsettled orders and an empty history, as expected");

  // ================= a PARTIAL settlement =================
  say(section, `POST /admin/settlements/shop/${shopId}/settle for ONE of the two orders`);
  const settle = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: { order_ids: [orderInfo[0].orderId], reference_note: `UTR-E2E-${STAMP}` },
  });
  assert(settle.status === 201, `expected 201, got ${settle.status}: ${JSON.stringify(settle.data)}`);
  assert(
    settle.data.settlement.order_count === 1,
    `expected 1 order in the batch, got ${settle.data.settlement.order_count}`
  );
  assert(
    settle.data.settlement.total_amount === orderInfo[0].vendor_amount,
    `expected the batch total to be just order 1's ${orderInfo[0].vendor_amount}, got ${settle.data.settlement.total_amount}`
  );
  const settlementId = settle.data.settlement._id;
  say(
    section,
    `  -> settlement ${settlementId} recorded: 1 order, ${settle.data.settlement.total_amount}, ref "${settle.data.settlement.reference_note}"`
  );

  say(section, "Confirming order 1 moved to settled and order 2 did NOT");
  const o1 = await Order.findById(orderInfo[0].orderId).lean();
  const o2 = await Order.findById(orderInfo[1].orderId).lean();
  assert(o1.settlement_status === "settled", `order 1 expected "settled", got "${o1.settlement_status}"`);
  assert(
    String(o1.settlement_id) === String(settlementId),
    `order 1's settlement_id should point at the new batch, got ${o1.settlement_id}`
  );
  assert(o2.settlement_status === "unsettled", `order 2 expected "unsettled", got "${o2.settlement_status}"`);
  assert(o2.settlement_id === null, `order 2 should have no settlement_id, got ${o2.settlement_id}`);
  say(section, "  -> order 1 settled and linked to the batch; order 2 untouched");

  say(section, "Confirming the shop still appears in pending, now owing only order 2");
  const pending2 = await api("GET", "/admin/settlements/pending", { token: adminToken });
  const mine2 = pending2.data.find((r) => String(r.shop_id) === String(shopId));
  assert(mine2, "the shop must still appear in pending while it is still owed for order 2");
  assert(mine2.unsettled_order_count === 1, `expected 1 remaining, got ${mine2.unsettled_order_count}`);
  assert(
    mine2.total_unsettled_amount === orderInfo[1].vendor_amount,
    `expected ${orderInfo[1].vendor_amount} still owed, got ${mine2.total_unsettled_amount}`
  );
  say(section, `  -> still owed ${mine2.total_unsettled_amount} for 1 order`);

  // ================= rejection cases =================
  say(section, "Re-settling the SAME order - expect 400 naming it");
  const resettle = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: { order_ids: [orderInfo[0].orderId] },
  });
  assert(resettle.status === 400, `expected 400, got ${resettle.status}: ${JSON.stringify(resettle.data)}`);
  assert(
    resettle.data.message.includes(String(orderInfo[0].orderId)),
    `the rejection must name the offending order, got "${resettle.data.message}"`
  );
  assert(
    /already been settled/i.test(resettle.data.message),
    `expected an "already settled" reason, got "${resettle.data.message}"`
  );
  say(section, `  -> rejected: "${resettle.data.message}"`);

  say(section, "Settling an order that is not completed - expect 400 naming it and why");
  const freshUps = await uploadTestFiles(customerToken, [
    { buffer: makeDummyPdfBuffer(1), filename: `e2e-test-${STAMP}-settle-pending.pdf` },
  ]);
  const pendingOrder = await api("POST", "/orders", {
    token: customerToken,
    body: { shop_id: shopId, documents: docs(freshUps.map((u) => u.upload_id)) },
  });
  assert(pendingOrder.status === 201, `expected 201, got ${pendingOrder.status}`);
  created.orderIds.push(pendingOrder.data._id);
  const notDone = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: { order_ids: [pendingOrder.data._id] },
  });
  assert(notDone.status === 400, `expected 400, got ${notDone.status}: ${JSON.stringify(notDone.data)}`);
  assert(
    notDone.data.message.includes(String(pendingOrder.data._id)) && /not completed/i.test(notDone.data.message),
    `expected a "not completed" reason naming the order, got "${notDone.data.message}"`
  );
  say(section, `  -> rejected: "${notDone.data.message}"`);

  say(section, "Settling an order belonging to a DIFFERENT shop - expect 400");
  const foreign = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: { order_ids: [created.orderIds[0]] },
  });
  assert(foreign.status === 400, `expected 400, got ${foreign.status}: ${JSON.stringify(foreign.data)}`);
  say(section, `  -> rejected: "${foreign.data.message}"`);

  // ================= the vendor's own view =================
  say(section, "GET /shops/me/settlements as the vendor");
  const mySettlements = await api("GET", "/shops/me/settlements", { token: vendorToken });
  assert(mySettlements.status === 200, `expected 200, got ${mySettlements.status}: ${JSON.stringify(mySettlements.data)}`);
  assert(
    mySettlements.data.unsettled.order_count === 1,
    `vendor should see 1 unsettled order, got ${mySettlements.data.unsettled.order_count}`
  );
  assert(
    mySettlements.data.unsettled.total_amount === orderInfo[1].vendor_amount,
    `vendor should see ${orderInfo[1].vendor_amount} owed, got ${mySettlements.data.unsettled.total_amount}`
  );
  assert(
    mySettlements.data.settlements.length === 1,
    `vendor should see 1 past settlement, got ${mySettlements.data.settlements.length}`
  );
  assert(
    mySettlements.data.settlements[0].total_amount === orderInfo[0].vendor_amount,
    `vendor's history amount should be ${orderInfo[0].vendor_amount}, got ${mySettlements.data.settlements[0].total_amount}`
  );
  assert(
    mySettlements.data.settlements[0].reference_note === `UTR-E2E-${STAMP}`,
    `vendor should see the reference note, got "${mySettlements.data.settlements[0].reference_note}"`
  );
  say(
    section,
    `  -> vendor sees ${mySettlements.data.unsettled.total_amount} still owed and 1 payment of ${mySettlements.data.settlements[0].total_amount} (ref ${mySettlements.data.settlements[0].reference_note})`
  );

  // The two sides must agree, since they read the same definition
  // (utils/settlement.js).
  assert(
    mySettlements.data.unsettled.total_amount === mine2.total_unsettled_amount,
    `vendor (${mySettlements.data.unsettled.total_amount}) and admin (${mine2.total_unsettled_amount}) disagree about what is owed`
  );
  say(section, "  -> confirmed: vendor and admin agree on the outstanding amount");

  // ================= settling the remainder, with no order_ids =========
  say(section, "POST .../settle with NO order_ids - should sweep up everything still outstanding");
  const settleRest = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: {},
  });
  assert(settleRest.status === 201, `expected 201, got ${settleRest.status}: ${JSON.stringify(settleRest.data)}`);
  assert(
    settleRest.data.settlement.order_count === 1,
    `expected just the 1 remaining order, got ${settleRest.data.settlement.order_count}`
  );
  assert(
    settleRest.data.settlement.total_amount === orderInfo[1].vendor_amount,
    `expected ${orderInfo[1].vendor_amount}, got ${settleRest.data.settlement.total_amount}`
  );
  say(section, `  -> swept ${settleRest.data.settlement.order_count} order for ${settleRest.data.settlement.total_amount}`);

  say(section, "Confirming the shop has now dropped out of the pending list entirely");
  const pending3 = await api("GET", "/admin/settlements/pending", { token: adminToken });
  assert(
    !pending3.data.find((r) => String(r.shop_id) === String(shopId)),
    "a fully-settled shop should no longer appear in pending settlements"
  );
  say(section, "  -> gone from pending, as expected");

  say(section, "Settling again with nothing outstanding - expect 400");
  const nothingLeft = await api("POST", `/admin/settlements/shop/${shopId}/settle`, {
    token: adminToken,
    body: {},
  });
  assert(nothingLeft.status === 400, `expected 400, got ${nothingLeft.status}: ${JSON.stringify(nothingLeft.data)}`);
  say(section, `  -> rejected: "${nothingLeft.data.message}"`);

  // ================= the audit trail =================
  say(section, "GET /admin/settlements?shop_id=... for the audit trail");
  const audit = await api("GET", `/admin/settlements?shop_id=${shopId}`, { token: adminToken });
  assert(audit.status === 200, `expected 200, got ${audit.status}: ${JSON.stringify(audit.data)}`);
  assert(audit.data.length === 2, `expected 2 settlement batches, got ${audit.data.length}`);
  assert(
    new Date(audit.data[0].settled_at) >= new Date(audit.data[1].settled_at),
    "the audit list must be newest-first"
  );
  assert(audit.data[0].settled_by_name, "expected the settling admin's name in the audit trail");
  assert(audit.data.every((r) => r.shop_name), "expected the shop name on each audit row");
  const auditTotal = audit.data.reduce((sum, r) => sum + r.total_amount, 0);
  assert(
    Math.round(auditTotal * 100) / 100 === expectedTotal,
    `the two batches should add up to the original ${expectedTotal}, got ${auditTotal}`
  );
  say(
    section,
    `  -> 2 batches by ${audit.data[0].settled_by_name}, totalling ${Math.round(auditTotal * 100) / 100} - matching what was originally owed`
  );

  // ================= admin shop list additions =================
  say(section, "GET /admin/shops - confirming order_count and both photo fields are present");
  const shopList = await api("GET", "/admin/shops", { token: adminToken });
  assert(shopList.status === 200, `expected 200, got ${shopList.status}`);
  const listed = shopList.data.find((r) => String(r._id) === String(shopId));
  assert(listed, "the test shop is missing from GET /admin/shops");
  assert(
    typeof listed.order_count === "number",
    `expected a numeric order_count, got ${JSON.stringify(listed.order_count)}`
  );
  // 3 orders were created at this shop: two completed, one left pending.
  assert(
    listed.order_count === 3,
    `expected order_count 3 (all-time, regardless of status), got ${listed.order_count}`
  );
  assert("shop_photo_url" in listed, "expected shop_photo_url on the admin shop list");
  assert("owner_photo_url" in listed, "expected owner_photo_url on the admin shop list");
  assert(
    listed.payout === undefined,
    "the admin SHOP LIST must never carry payout bank details - only the settlement detail route does"
  );
  say(section, `  -> order_count ${listed.order_count} (all-time), both photo fields present, no payout leaked`);

  // ================= payout must never reach a customer =================
  say(section, "Confirming payout details never appear on any customer-facing shop payload");
  const custList = await api("GET", "/shops", { token: customerToken });
  assert(custList.status === 200, `expected 200 from GET /shops, got ${custList.status}`);
  for (const shop of custList.data) {
    assert(shop.payout === undefined, `GET /shops leaked payout details for shop ${shop._id}`);
  }
  const custDetail = await api("GET", `/shops/${shopId}`, { token: customerToken });
  assert(custDetail.status === 200, `expected 200 from GET /shops/:id, got ${custDetail.status}`);
  assert(custDetail.data.payout === undefined, "GET /shops/:id leaked payout details");
  say(section, "  -> confirmed: no payout field on GET /shops or GET /shops/:id");
}

async function cleanup() {
  const section = "cleanup";
  await mongoose.connect(process.env.MONGODB_URI);
  say(section, "Connected to MongoDB for cleanup");

  // Notifications are deleted by RECIPIENT, not by order, because there
  // are two families now and only one of them has an order_id: the
  // shop_approved/shop_rejected notifications the admin panel sends to a
  // vendor reference a shop instead (see models/Notification.js). Deleting
  // by created.orderIds alone left those behind as orphans pointing at
  // users this cleanup had already removed.
  // Support threads go first, messages before conversations, since the
  // messages are only reachable through the conversation ids.
  if (created.userIds.length) {
    const convos = await Conversation.find({ customer_id: { $in: created.userIds } }).select("_id").lean();
    if (convos.length) {
      const msgRes = await Message.deleteMany({ conversation_id: { $in: convos.map((c) => c._id) } });
      const convoRes = await Conversation.deleteMany({ _id: { $in: convos.map((c) => c._id) } });
      say(
        section,
        `Deleted ${convoRes.deletedCount} support conversation(s) and ${msgRes.deletedCount} message(s)`
      );
    }
  }

  if (created.userIds.length) {
    const notifRes = await Notification.deleteMany({ user_id: { $in: created.userIds } });
    say(section, `Deleted ${notifRes.deletedCount} notification(s) belonging to test users`);
  }

  // Settlements and payout history reference the test shops, so they go
  // before the shops themselves - otherwise they'd be left pointing at
  // shop ids that no longer exist.
  const allShopIds = [created.shopId, ...created.extraShopIds].filter(Boolean);
  if (allShopIds.length) {
    const settleRes = await Settlement.deleteMany({ shop_id: { $in: allShopIds } });
    const payoutRes = await PayoutHistory.deleteMany({ shop_id: { $in: allShopIds } });
    if (settleRes.deletedCount || payoutRes.deletedCount) {
      say(
        section,
        `Deleted ${settleRes.deletedCount} settlement(s) and ${payoutRes.deletedCount} payout history row(s)`
      );
    }
  }

  if (created.orderIds.length) {
    // Belt and braces: catches any notification tied to a test order whose
    // recipient somehow isn't in created.userIds.
    const strayNotifs = await Notification.deleteMany({ order_id: { $in: created.orderIds } });
    if (strayNotifs.deletedCount) {
      say(section, `Deleted ${strayNotifs.deletedCount} further notification(s) tied to test orders`);
    }

    // Email-delivery records, for the same reason. Order events now also
    // dispatch transactional email (utils/orderEvents.js), and every
    // attempt writes a durable dedupe record keyed on the order - including
    // when Brevo is unconfigured, where it is written as "skipped" so an
    // operator can see which emails a deployment did not send. Without this
    // a full e2e run left dozens of records pointing at orders and users it
    // had just deleted.
    const EmailDelivery = require("../models/EmailDelivery");
    const emailRecords = await EmailDelivery.deleteMany({
      $or: [{ order_id: { $in: created.orderIds } }, { user_id: { $in: created.userIds } }],
    });
    if (emailRecords.deletedCount) {
      say(section, `Deleted ${emailRecords.deletedCount} email delivery record(s) tied to test data`);
    }

    const res = await Order.deleteMany({ _id: { $in: created.orderIds } });
    say(section, `Deleted ${res.deletedCount} test order(s): ${created.orderIds.join(", ")}`);
  } else {
    say(section, "No orders were created - nothing to delete");
  }

  if (created.shopId) {
    const savedRes = await SavedShop.deleteMany({ shop_id: created.shopId });
    if (savedRes.deletedCount > 0) {
      say(section, `Deleted ${savedRes.deletedCount} leftover saved-shop record(s) for the test shop`);
    }
  }

  if (created.uploadIds.length) {
    const uploads = await Upload.find({ _id: { $in: created.uploadIds } });
    for (const u of uploads) {
      try {
        const destroyRes = await cloudinary.uploader.destroy(u.public_id, { resource_type: "raw" });
        say(section, `Deleted Cloudinary file ${u.public_id} (result: ${destroyRes.result})`);
      } catch (err) {
        say(section, `WARNING: could not delete Cloudinary file ${u.public_id}: ${err.message}`);
      }
    }
    const res = await Upload.deleteMany({ _id: { $in: created.uploadIds } });
    say(section, `Deleted ${res.deletedCount} test upload record(s): ${created.uploadIds.join(", ")}`);
  } else {
    say(section, "No uploads were created - nothing to delete");
  }

  if (created.shopId) {
    // Unlike print documents, shop/owner photos and the KYC id proof
    // (uploaded directly in shopController.js) have no Upload record
    // tracking them - they only ever exist as fields on the Shop
    // document itself. Read those fields BEFORE deleting the shop below,
    // or there'd be nothing left to clean them up from.
    const shopDoc = await Shop.findById(created.shopId);
    if (shopDoc) {
      // Photos don't have a stored public_id (the photos endpoint never
      // returns/stores one, only the delivery URL) - but a Cloudinary
      // secure_url always has the shape .../upload/v<version>/<public_id>.<ext>,
      // so it can be recovered reliably rather than guessed.
      const photoUrls = [shopDoc.owner_photo_url, shopDoc.shop_photo_url].filter(Boolean);
      for (const url of photoUrls) {
        const match = url.match(/\/upload\/v\d+\/(.+)\.\w+$/);
        if (!match) {
          say(section, `WARNING: could not extract a public_id from shop photo URL ${url} - skipping its Cloudinary cleanup`);
          continue;
        }
        try {
          const destroyRes = await cloudinary.uploader.destroy(match[1], { resource_type: "image" });
          say(section, `Deleted Cloudinary shop photo ${match[1]} (result: ${destroyRes.result})`);
        } catch (err) {
          say(section, `WARNING: could not delete Cloudinary shop photo ${match[1]}: ${err.message}`);
        }
      }

      if (shopDoc.kyc?.id_proof_url) {
        created.kycPublicIds.push(shopDoc.kyc.id_proof_url);
      }
      // Deduped - the current id is usually already tracked from Section 3.
      for (const publicId of [...new Set(created.kycPublicIds)]) {
        try {
          const destroyRes = await cloudinary.uploader.destroy(publicId, {
            resource_type: "raw",
            type: "authenticated",
          });
          say(section, `Deleted Cloudinary KYC file ${publicId} (result: ${destroyRes.result})`);
        } catch (err) {
          say(section, `WARNING: could not delete Cloudinary KYC file ${publicId}: ${err.message}`);
        }
      }
    }

    const res = await Shop.deleteOne({ _id: created.shopId });
    say(section, `Deleted test shop ${created.shopId} (deletedCount: ${res.deletedCount})`);
  } else {
    say(section, "No shop was created - nothing to delete");
  }

  if (created.extraShopIds.length) {
    // The comparePricingAcrossShops shops never had photos or KYC
    // uploaded (they only need pricing to exercise the endpoint), so
    // unlike created.shopId above there's no Cloudinary cleanup to do -
    // just the DB records.
    const res = await Shop.deleteMany({ _id: { $in: created.extraShopIds } });
    say(section, `Deleted ${res.deletedCount} extra test shop(s): ${created.extraShopIds.join(", ")}`);
  } else {
    say(section, "No extra shops were created - nothing to delete");
  }

  if (created.userIds.length) {
    const res = await User.deleteMany({ _id: { $in: created.userIds } });
    say(section, `Deleted ${res.deletedCount} test user(s): ${created.userIds.join(", ")}`);
  } else {
    say(section, "No users were created - nothing to delete");
  }

  await mongoose.disconnect();
  say(section, "Disconnected from MongoDB");
}

// --- Runner ----------------------------------------------------------------

async function runSection(key, fn) {
  console.log(`\n=== ${results[key].name} ===`);
  try {
    const value = await fn();
    results[key].pass = true;
    return { ok: true, value };
  } catch (err) {
    results[key].pass = false;
    say(key, `FAILED: ${err.message}`);
    return { ok: false };
  }
}

async function main() {
  console.log(`E2E test run ${STAMP} against ${BASE_URL}`);

  let customerToken, customerId, vendorToken, shopId, orderId, otp, uploads;

  const r1 = await runSection("customerFlow", async () => {
    const out = await customerFlow();
    customerToken = out.customerToken;
    customerId = out.customerId;
  });

  const r2 = await runSection("vendorFlow", async () => {
    const out = await vendorFlow();
    vendorToken = out.vendorToken;
    shopId = out.shopId;
  });

  // Runs immediately once the shop exists, before anything else touches
  // it - approves the shop so every section below gets a shop that's
  // already visible in GET /shops, exactly like a real vendor who
  // finished onboarding before taking their first order.
  let r3 = { ok: false };
  if (r1.ok && r2.ok) {
    r3 = await runSection("vendorOnboarding", () => vendorOnboarding(vendorToken, shopId));
  } else {
    results.vendorOnboarding.pass = false;
    say("vendorOnboarding", "SKIPPED: prerequisite section (1 or 2) did not complete");
  }

  if (r1.ok && r2.ok && r3.ok) {
    const r4 = await runSection("uploadOrder", async () => {
      const out = await uploadAndCreateOrder(customerToken, shopId);
      orderId = out.orderId;
      otp = out.otp;
      uploads = out.uploads;
    });

    if (r4.ok) {
      const r5 = await runSection("vendorOrderMgmt", () =>
        vendorOrderManagement(vendorToken, customerToken, shopId, orderId, otp, uploads)
      );

      if (r5.ok) {
        await runSection("customerHistory", () => customerOrderHistory(customerToken, orderId));
      } else {
        results.customerHistory.pass = false;
        say("customerHistory", "SKIPPED: section 5 (vendor order management) did not complete");
      }
    } else {
      results.vendorOrderMgmt.pass = false;
      results.customerHistory.pass = false;
      say("vendorOrderMgmt", "SKIPPED: section 4 (upload + order creation) did not complete");
      say("customerHistory", "SKIPPED: section 4 (upload + order creation) did not complete");
    }
  } else {
    for (const key of ["uploadOrder", "vendorOrderMgmt", "customerHistory"]) {
      results[key].pass = false;
      say(key, "SKIPPED: prerequisite section (1, 2 or 3) did not complete");
    }
  }

  // Independent of sections 4-6 above (its own order, never touches the
  // first one) - only needs a logged-in customer and an approved shop.
  if (r1.ok && r2.ok && r3.ok) {
    await runSection("expiredCleanup", () => expiredOrderCleanup(customerToken, shopId));
  } else {
    results.expiredCleanup.pass = false;
    say("expiredCleanup", "SKIPPED: prerequisite section (1, 2 or 3) did not complete");
  }

  // Sections 8-16 are all independent of each other and of 4-7 - each
  // creates whatever it needs from scratch, only relying on the customer/
  // vendor accounts and the already-approved shop from sections 1-3.
  // queueIndicator specifically depends on section 3 having approved the
  // shop (it asserts the shop appears in GET /shops), so it's gated on
  // r3 same as everything else here even though the others aren't.
  // paymentVerification runs before it deliberately (not that it depends
  // on it - it's just a natural place for it, since both drive orders
  // through payment at the shared shop). comparePricingAcrossShops and
  // shopDeactivation only strictly need a logged-in customer (r1) - each
  // creates its own throwaway shop(s) rather than using the shared one -
  // but they're grouped here anyway for the same reason as the others.
  // pricingConfigIsPlatformFeeOnly needs nothing at all (a public route),
  // same story. shopOpenStatus runs before those two deliberately: it
  // manually closes/reopens the SHARED shop and toggles its
  // business_hours, and nothing after it in this run ever places another
  // order at that shared shop - if it ran later, a section failing
  // partway through it could leave the shared shop closed for whatever
  // ran next.
  if (r1.ok && r2.ok && r3.ok) {
    await runSection("itemizedPricing", () => itemizedPricing(customerToken, vendorToken, shopId));
    await runSection("paymentVerification", () => paymentVerification(customerToken, vendorToken, shopId));
    await runSection("queueIndicator", () => queueIndicator(customerToken, shopId));
    await runSection("savedShops", () => savedShops(customerToken, shopId));
    await runSection("notifications", () => notifications(customerToken, vendorToken, shopId));
    await runSection("comparePricing", () => comparePricingAcrossShops(customerToken));
    await runSection("shopOpenStatus", () => shopOpenStatus(customerToken, vendorToken, shopId));
    await runSection("pricingConfig", pricingConfigIsPlatformFeeOnly);
    await runSection("shopDeactivation", () => shopDeactivation(customerToken));
    await runSection("adminPanel", () => adminPanel(customerToken, shopId));
    await runSection("shopLocation", () => shopLocationSearch(customerToken));
    await runSection("customerSupport", () => customerSupport(customerToken, vendorToken, orderId));
    await runSection("payoutSettlements", () => payoutSettlements(customerToken));
  } else {
    for (const key of [
      "itemizedPricing",
      "paymentVerification",
      "queueIndicator",
      "savedShops",
      "notifications",
      "comparePricing",
      "shopOpenStatus",
      "pricingConfig",
      "shopDeactivation",
      "adminPanel",
      "shopLocation",
      "customerSupport",
      "payoutSettlements",
    ]) {
      results[key].pass = false;
      say(key, "SKIPPED: prerequisite section (1, 2 or 3) did not complete");
    }
  }

  // Cleanup always runs, no matter what failed above.
  await runSection("cleanup", cleanup);

  console.log("\n================ SUMMARY ================");
  let allPass = true;
  for (const key of Object.keys(results)) {
    const r = results[key];
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`${status.padEnd(4)} - ${r.name}`);
  }
  console.log("===========================================");
  console.log(allPass ? "ALL SECTIONS PASSED" : "ONE OR MORE SECTIONS FAILED (see log above)");

  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\nFATAL - unexpected error outside of any section:", err);
  try {
    await cleanup();
  } catch (cleanupErr) {
    console.error("Cleanup also failed:", cleanupErr);
  }
  process.exit(1);
});
