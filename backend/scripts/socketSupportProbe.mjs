// Socket.io transport check for the customer support chat - the half
// scripts/e2eTest.js deliberately does not cover (see its customerSupport
// section for why).
//
// Needs NO running server and NO database: it boots a throwaway
// Socket.io server on an ephemeral port using the real config/socket.js,
// and everything it asserts - the handshake, room membership, who
// receives a broadcast - happens before any handler touches Mongo. It
// only needs JWT_SECRET from .env, so the tokens it mints are the same
// ones the real server would accept.
//
// Usage: node scripts/socketSupportProbe.mjs
import { createRequire } from "module";
import http from "http";
const require = createRequire(import.meta.url);
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { io: connect } = require("socket.io-client");
const { initSocket, customerRoom, ADMIN_ROOM } = require("../config/socket");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};

const server = http.createServer();
const io = initSocket(server);
await new Promise((r) => server.listen(0, r));
const URL = `http://localhost:${server.address().port}`;

const sign = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "5m" });

// Resolves to { ok } on connect or { err } on connect_error, so a
// rejection is an ordinary result here rather than an unhandled event.
function tryConnect(auth) {
  return new Promise((resolve) => {
    const socket = connect(URL, { auth, transports: ["websocket"], reconnection: false });
    socket.on("connect", () => resolve({ ok: true, socket }));
    socket.on("connect_error", (err) => resolve({ ok: false, message: err.message }));
  });
}

// --- rejection cases -----------------------------------------------------
const noToken = await tryConnect({});
check(!noToken.ok, "a socket with NO token is rejected", noToken.message);

const junk = await tryConnect({ token: "not-a-jwt" });
check(!junk.ok, "a malformed token is rejected", junk.message);

const wrongSecret = await tryConnect({
  token: jwt.sign({ id: "6510f0000000000000000001", role: "customer" }, "the-wrong-secret"),
});
check(!wrongSecret.ok, "a token signed with the wrong secret is rejected", wrongSecret.message);

const expired = await tryConnect({
  token: jwt.sign({ id: "6510f0000000000000000001", role: "customer" }, process.env.JWT_SECRET, {
    expiresIn: "-1s",
  }),
});
check(!expired.ok, "an EXPIRED token is rejected", expired.message);

// --- accepted cases, and where they land ---------------------------------
const CUSTOMER = "6510f0000000000000000001";
const OTHER_CUSTOMER = "6510f0000000000000000002";
const ADMIN = "6510f000000000000000000a";

const cust = await tryConnect({ token: sign(CUSTOMER, "customer") });
check(cust.ok, "a valid customer token connects");

const admin = await tryConnect({ token: sign(ADMIN, "admin") });
check(admin.ok, "a valid admin token connects");

// Give the server's connection handler a moment to finish joining rooms.
await new Promise((r) => setTimeout(r, 150));

const roomsOf = (id) => io.sockets.adapter.sids.get(id);
const custRooms = roomsOf(cust.socket.id);
check(
  custRooms?.has(customerRoom(CUSTOMER)),
  "the customer auto-joins their OWN thread room",
  customerRoom(CUSTOMER)
);
check(
  !custRooms?.has(ADMIN_ROOM),
  "and is not in the admin notification room"
);

const adminRooms = roomsOf(admin.socket.id);
check(adminRooms?.has(ADMIN_ROOM), "the admin joins the global notification room", ADMIN_ROOM);
check(
  ![...adminRooms].some((r) => r.startsWith("support:")),
  "but no conversation room until it opens one",
  [...adminRooms].join(", ")
);

// --- opening a conversation, and only one at a time ----------------------
const open = (socket, customerId) =>
  new Promise((resolve) => socket.emit("support:open", { customerId }, resolve));

await open(admin.socket, CUSTOMER);
await new Promise((r) => setTimeout(r, 100));
check(
  roomsOf(admin.socket.id).has(customerRoom(CUSTOMER)),
  "support:open puts the admin in that customer's room"
);

await open(admin.socket, OTHER_CUSTOMER);
await new Promise((r) => setTimeout(r, 100));
const afterSecondOpen = [...roomsOf(admin.socket.id)].filter((r) => r.startsWith("support:"));
check(
  afterSecondOpen.length === 1 && afterSecondOpen[0] === customerRoom(OTHER_CUSTOMER),
  "opening a second conversation LEAVES the first (no accumulating rooms)",
  afterSecondOpen.join(", ")
);
check(
  roomsOf(admin.socket.id).has(ADMIN_ROOM),
  "and the admin stays in the global room throughout"
);

// --- a customer cannot open someone else's thread ------------------------
const asCustomer = await new Promise((resolve) =>
  cust.socket.emit("support:open", { customerId: OTHER_CUSTOMER }, resolve)
);
check(asCustomer?.ok === false, "a CUSTOMER emitting support:open is refused", asCustomer?.message);
check(
  !roomsOf(cust.socket.id).has(customerRoom(OTHER_CUSTOMER)),
  "and did not end up in another customer's room"
);

// --- delivery actually reaches the right sockets -------------------------
// Emitted straight into the room (the same call broadcastMessage makes),
// so this tests the addressing without needing a database behind it.
const heard = (socket) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 400);
    socket.once("support:message", (m) => {
      clearTimeout(t);
      resolve(m);
    });
  });

await open(admin.socket, CUSTOMER);
await new Promise((r) => setTimeout(r, 100));
const custHeard = heard(cust.socket);
const adminHeard = heard(admin.socket);
io.to(customerRoom(CUSTOMER)).emit("support:message", { text: "ping" });
check((await custHeard)?.text === "ping", "a message to the thread room reaches the customer");
check((await adminHeard)?.text === "ping", "and the admin who has that thread open");

// With the admin moved away, the customer still hears; the admin must not.
await open(admin.socket, OTHER_CUSTOMER);
await new Promise((r) => setTimeout(r, 100));
const custHeard2 = heard(cust.socket);
const adminHeard2 = heard(admin.socket);
const adminNotified = new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), 400);
  admin.socket.once("support:notification", (n) => {
    clearTimeout(t);
    resolve(n);
  });
});
io.to(customerRoom(CUSTOMER)).emit("support:message", { text: "pong" });
io.to(ADMIN_ROOM).emit("support:notification", { customerId: CUSTOMER, unread_by_admin: 1 });
check((await custHeard2)?.text === "pong", "the customer still receives their own thread");
check((await adminHeard2) === null, "an admin looking at another thread does NOT receive it");
check(
  (await adminNotified)?.unread_by_admin === 1,
  "but still gets the badge notification - which is the point of the global room"
);

cust.socket.close();
admin.socket.close();
io.close();
server.close();
console.log(`\n${fail ? `${fail} FAILED, ` : ""}${pass} passed`);
process.exit(fail ? 1 : 0);
