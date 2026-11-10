const { Server } = require("socket.io");
const { authenticateToken } = require("../middleware/auth");
const { isOriginAllowed, resolveAllowedOrigins } = require("./security");

// The Socket.io server, attached to the SAME HTTP server Express runs on
// (see server.js) rather than a second listener on another port. One
// port means one CORS story, one deploy, and one URL for both clients to
// configure - the app and the admin panel already know the API's base
// address, and that address is now also the socket address.
//
// Held at module scope so any code that needs to push something out
// (utils/supportMessaging.js, called from both the REST handlers and the
// socket handlers) can reach it without being handed it through every
// intermediate function.
let io = null;

// Room names, in one place. Both sides of every emit and every join go
// through these, so a typo can't silently deliver a message into a room
// nobody is listening on.
const customerRoom = (customerId) => `support:${customerId}`;

// Order-event rooms, added alongside the support rooms rather than replacing
// them - support chat keeps its own namespace and is untouched.
//
//   user:<id>   every authenticated socket, joined automatically at connect.
//               A customer's order events go here, which is what scopes them:
//               the room is named after the id in their OWN token, so no
//               customer can be in another customer's room.
//   shop:<id>   joined at connect by a shop owner, for the shops they own -
//               resolved from the database, never from anything the client
//               says. This is how a vendor hears about new paid orders
//               without anything being broadcast globally.
//   order:<id>  opt-in, for a client watching one order closely. Joining is
//               authorised against the order itself - see
//               sockets/orderSocket.js.
const userRoom = (userId) => `user:${userId}`;
const shopRoom = (shopId) => `shop:${shopId}`;
const sessionRoom = (jti) => `session:${jti}`;
const orderRoom = (orderId) => `order:${orderId}`;
// Every connected admin sits here for the whole session. It is the only
// way an unread badge can update for a conversation the admin does not
// currently have open - joining every conversation room instead would
// mean subscribing each admin to every customer on the platform.
const ADMIN_ROOM = "admin:support";

function initSocket(httpServer) {
  // Resolved once, at startup, rather than per handshake - the list cannot
  // change while the process runs, and re-reading it on every connection
  // would move a configuration error from boot time into the middle of a
  // customer opening the support chat.
  const allowlist = resolveAllowedOrigins();

  io = new Server(httpServer, {
    // The SAME allowlist the REST API uses (config/security.js), not a
    // second copy of the policy. Socket.io is reachable from a browser on
    // this same port, so an origin rule that applied only to Express would
    // leave the realtime half open - and the realtime half carries the
    // support conversations.
    //
    // Expressed as a callback because the allowlist is a list plus a
    // development rule, which Socket.io's static origin option cannot
    // represent. A disallowed browser origin is refused during the
    // handshake; connections with no Origin header at all - the Expo app,
    // the probe scripts - are allowed through to the JWT check below,
    // exactly as on the REST side.
    cors: {
      origin(origin, callback) {
        callback(null, isOriginAllowed(origin, process.env, allowlist));
      },
      credentials: process.env.CORS_ALLOW_CREDENTIALS === "true",
    },
  });

  // Authentication happens ONCE, during the handshake, rather than per
  // event. A socket that gets past this point is permanently associated
  // with one authenticated user, so no individual event handler has to
  // re-establish who is sending it - which is also what makes it safe
  // for a handler to trust socket.user over anything in the payload.
  io.use(async (socket, next) => {
    try {
      // The SAME function the REST middleware uses (middleware/auth.js), so
      // signature, expiry, claims AND revocation are judged identically on
      // both. That matters most for revocation: if this still only checked
      // the signature, signing out would close the REST door and leave the
      // websocket open on the same dead token.
      const identity = await authenticateToken(socket.handshake.auth?.token);
      if (!identity) {
        // The client receives this as a connect_error and should not retry
        // blindly - the token needs replacing, not resending.
        return next(new Error("Unauthorized: missing or invalid token"));
      }
      socket.user = { id: identity.id, role: identity.role };
      socket.data.session = { jti: identity.jti, exp: identity.exp };
      next();
    } catch (error) {
      // Fail closed, for the same reason the REST path does: an unknown
      // revocation state must not be treated as a valid one.
      console.error(`[socket] handshake verification failed: ${error.message}`);
      next(new Error("Unauthorized: could not verify token"));
    }
  });

  io.on("connection", async (socket) => {
    const { jti, exp } = socket.data.session;
    if (jti) socket.join(sessionRoom(jti));
    if (Number.isFinite(exp)) {
      const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, exp * 1000 - Date.now()));
      expiry.unref();
      socket.once("disconnect", () => clearTimeout(expiry));
    }

    // Every authenticated socket joins its own user room. Named from the id
    // in the verified token (socket.user, set during the handshake above),
    // never from anything the client sends, so this cannot be used to listen
    // in on someone else.
    socket.join(userRoom(socket.user.id));

    // A shop owner also joins a room per shop they own. The shop list comes
    // from the database rather than from the client, which is the whole
    // authorisation check: a vendor cannot ask to be put in another shop's
    // room because they never get to name one.
    if (socket.user.role === "shop_owner") {
      try {
        const Shop = require("../models/Shop");
        const shops = await Shop.find({ owner_id: socket.user.id }).select("_id").lean();
        for (const shop of shops) socket.join(shopRoom(shop._id));
      } catch (error) {
        // A failure here costs this vendor live order events for the session;
        // their dashboard still polls, so it is not worth refusing the
        // connection over.
        console.error(`[socket] could not join shop rooms for ${socket.user.id}: ${error.message}`);
      }
    }

    // A customer only ever has one thread (their own), so there is
    // nothing to choose and nothing to ask for: join it immediately.
    // This is also the authorisation boundary for customers - the room
    // is named after the id in their own token, so no customer can end
    // up receiving another customer's messages.
    if (socket.user.role === "customer") {
      socket.join(customerRoom(socket.user.id));
    }

    // An admin handles many threads, so which conversation room they
    // belong in changes as they click around; that join is driven by
    // 'support:open' below. The global room, however, they join for the
    // whole session - it is what keeps the unread badges live.
    if (socket.user.role === "admin") {
      socket.join(ADMIN_ROOM);
    }

    require("../sockets/supportSocket").registerSupportHandlers(io, socket);
    require("../sockets/orderSocket").registerOrderHandlers(io, socket);
  });

  return io;
}

// Returns null if called before initSocket - e.g. from a script that
// loads a controller without booting the server. Callers must handle
// that rather than assume a live io, which is why the send path treats
// broadcasting as best-effort: a message that was persisted but not
// broadcast is recoverable (the next fetch shows it), a send that throws
// because nobody was listening is not.
const getIo = () => io;

module.exports = { initSocket, getIo, customerRoom, userRoom, shopRoom, sessionRoom, orderRoom, ADMIN_ROOM };
