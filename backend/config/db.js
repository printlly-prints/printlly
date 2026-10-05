const mongoose = require("mongoose");

// Connects to MongoDB using the URI from environment variables.
// Called once when the server starts up (see server.js).
//
// MONITORING
//
// MongoDB is the one dependency whose loss means this application can do
// nothing at all - no order, no login, no document record. So unlike every
// other integration, its availability is not merely reported, it is alerted
// on at P0: a disconnect is the single highest-value signal this system can
// emit, and the difference between noticing it in seconds and noticing it
// from a customer complaint is the whole value of the alerting layer.
//
// The listeners below are attached rather than polled. Mongoose already
// knows when the driver loses its connection pool, and its own events are
// both faster and more accurate than anything a health check could infer.
// GET /health/ready still issues a real ping, because readyState can lag
// reality - see controllers/healthController.js.
//
// Requiring utils/alerts.js here is safe: it depends on config/observability,
// utils/sentry, utils/scrub and utils/redis, none of which touch this file.
const { alertP0, alertP1, ALERT } = require("../utils/alerts");

// Set once the first successful connection has happened. Without it, the
// "disconnected" event that fires while a server is still starting up - a
// slow DNS lookup, a cluster waking from pause - would alert P0 before
// anything was ever connected, which is a false alarm at the loudest level.
let everConnected = false;

function attachConnectionMonitoring() {
  const connection = mongoose.connection;

  connection.on("connected", () => {
    everConnected = true;
  });

  connection.on("disconnected", () => {
    if (!everConnected) return;
    // Fire-and-forget. alertP0 never throws and never rejects, and awaiting
    // it inside an event handler would serve no purpose - there is nothing
    // to do with the result.
    alertP0({
      reason: ALERT.MONGO_UNAVAILABLE,
      title: "MongoDB disconnected",
      summary:
        "The backend has lost its connection to MongoDB. Every request that touches the database " +
        "will fail until it reconnects, and /health/ready is now returning 503. The driver retries " +
        "automatically, so this may clear on its own; if it does not, check the Atlas cluster status " +
        "and the IP access list.",
      facts: { ready_state: connection.readyState },
    });
  });

  connection.on("reconnected", () => {
    // Deliberately P1 rather than P0: recovery is good news, and good news
    // does not need to page anyone. It is still sent so that the channel
    // shows the incident closing rather than leaving an open P0 with no
    // resolution.
    alertP1({
      reason: ALERT.MONGO_DEGRADED,
      title: "MongoDB reconnected",
      summary: "The connection to MongoDB has been re-established and the backend is serving normally again.",
      facts: { ready_state: connection.readyState },
    });
  });

  connection.on("error", (error) => {
    // Driver-level errors after startup. P1 rather than P0 because many are
    // transient and self-healing, and because a genuine outage also produces
    // the "disconnected" event above, which does page.
    if (!everConnected) return;
    alertP1({
      reason: ALERT.MONGO_DEGRADED,
      title: "MongoDB connection error",
      summary: "The MongoDB driver reported an error. The connection may recover on its own.",
      facts: { ready_state: connection.readyState },
      error,
    });
  });
}

const connectDB = async () => {
  attachConnectionMonitoring();

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    everConnected = true;
    console.log("MongoDB connected");
  } catch (error) {
    // Still a hard exit. A server that cannot reach its database at startup
    // has nothing useful to serve, and exiting lets the platform's own
    // restart policy back it off rather than having it sit up and fail every
    // request. The alert is sent first, and awaited, because the process is
    // about to end and an unflushed alert would be lost - this is the one
    // place where waiting on the alerting layer is correct.
    //
    // Timed out rather than awaited indefinitely: if Teams is also
    // unreachable, the exit must not be delayed forever.
    await Promise.race([
      alertP0({
        reason: ALERT.MONGO_UNAVAILABLE,
        title: "Backend failed to start: MongoDB unreachable",
        summary:
          "The backend could not connect to MongoDB at startup and is exiting. It will not serve any " +
          "requests. Check the Atlas cluster status, the IP access list, and that MONGODB_URI is correct " +
          "for this environment.",
        error,
      }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);

    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.attachConnectionMonitoring = attachConnectionMonitoring;
