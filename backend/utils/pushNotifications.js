const { Expo } = require("expo-server-sdk");
const DeviceToken = require("../models/DeviceToken");

// Push delivery, behind a transport that tests can replace.
//
// PROVIDER: Expo Push Service (expo-server-sdk), chosen because the customer
// app IS an Expo app (userapp/package.json, SDK 57) and Expo's service is the only
// option that needs no native module work, no google-services.json in the
// repo, and no provider credential shipped inside the app. The alternative,
// talking to FCM and APNs directly, would mean ejecting from the managed
// workflow and holding two sets of platform credentials to deliver the same
// four notifications.
//
// Expo still delivers through FCM and APNs underneath - it is a relay, not a
// separate push network - so the platform limits are the usual ones, and a
// production Android build does eventually need FCM credentials uploaded to
// Expo. That requirement is documented in .env.example rather than hidden
// here, because it is the thing most likely to make push "mysteriously" not
// work in a real build.
//
// No credential is required to SEND: Expo accepts unauthenticated sends to a
// valid ExponentPushToken. EXPO_ACCESS_TOKEN is optional and only enables
// Expo's enhanced security mode, which rejects sends that do not carry it.
const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true,
});

// A token is capability-bearing - whoever holds it can notify that device - so
// it never reaches a log. This gives enough to correlate "device 4f2a..b1"
// across log lines without being usable.
function fingerprint(token) {
  if (typeof token !== "string" || token.length < 12) return "invalid";
  return `${token.slice(18, 24)}..${token.slice(-4)}`;
}

// The real transport. Separated from the orchestration below so tests can
// substitute a fake one and never touch Expo's servers - a test suite that
// depended on live push delivery would be slow, flaky, and would send real
// notifications to real devices.
const expoTransport = {
  async send(messages) {
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    for (const chunk of chunks) {
      // Sequential rather than parallel: Expo rate-limits, and these are
      // four-per-order notifications, not a broadcast campaign.
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    }
    return tickets;
  },
};

let transport = expoTransport;

// Test seam. Returns a restore function so a suite cannot leave the real
// transport swapped out for the rest of the process.
function setPushTransport(next) {
  const previous = transport;
  transport = next || expoTransport;
  return () => {
    transport = previous;
  };
}

// Expo's ticket errors that mean "this token will never work again". Anything
// else - a network blip, a 429, an Expo outage - is transient and must NOT
// cost the user their registration.
const PERMANENT_TOKEN_ERRORS = new Set(["DeviceNotRegistered", "InvalidCredentials"]);

// Sends one notification to every live device belonging to a user.
//
// NEVER THROWS. Push is downstream of the business operation that triggered it
// (see utils/orderEvents.js): an order is accepted whether or not the customer's
// phone can be reached, and a provider outage must not turn a successful
// acceptance into a failed request.
//
// Returns a small summary for logging and tests.
async function sendPushToUser(userId, { title, body, data = {} } = {}) {
  const summary = { sent: 0, failed: 0, deactivated: 0, skipped: 0 };

  try {
    const devices = await DeviceToken.find({ user_id: userId, active: true })
      .select("token platform")
      .lean();

    if (devices.length === 0) {
      summary.skipped = 1;
      return summary;
    }

    // Expo's own validity check, so an obviously malformed token is dropped
    // before a request is made rather than coming back as an error ticket.
    const valid = devices.filter((d) => Expo.isExpoPushToken(d.token));
    const malformed = devices.filter((d) => !Expo.isExpoPushToken(d.token));
    if (malformed.length > 0) {
      await DeviceToken.updateMany(
        { _id: { $in: malformed.map((d) => d._id) } },
        { $set: { active: false } }
      );
      summary.deactivated += malformed.length;
    }
    if (valid.length === 0) return summary;

    const messages = valid.map((device) => ({
      to: device.token,
      sound: "default",
      title,
      body,
      // Only what the app needs to navigate. utils/orderEvents.js decides
      // what goes in here, and deliberately keeps it to ids and a status -
      // a push payload travels through Apple's and Google's infrastructure
      // and is visible on a lock screen.
      data,
    }));

    const tickets = await transport.send(messages);

    // Expo returns one ticket per message, in order.
    const deadTokenIds = [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status === "ok") {
        summary.sent += 1;
        return;
      }
      summary.failed += 1;
      const code = ticket?.details?.error;
      if (PERMANENT_TOKEN_ERRORS.has(code)) {
        // This device is gone for good - the app was uninstalled or the token
        // rotated. Deactivating it stops us retrying forever, and touches
        // ONLY this token: the user's other devices are untouched.
        deadTokenIds.push(valid[index]._id);
      }
      console.error(
        `[push] delivery failed ${JSON.stringify({
          device: fingerprint(valid[index].token),
          platform: valid[index].platform,
          error: code || ticket?.message || "unknown",
          permanent: PERMANENT_TOKEN_ERRORS.has(code),
          timestamp: new Date().toISOString(),
        })}`
      );
    });

    if (deadTokenIds.length > 0) {
      await DeviceToken.updateMany({ _id: { $in: deadTokenIds } }, { $set: { active: false } });
      summary.deactivated += deadTokenIds.length;
    }

    if (summary.sent > 0) {
      await DeviceToken.updateMany(
        { _id: { $in: valid.map((d) => d._id) } },
        { $set: { last_used_at: new Date() } }
      );
    }
  } catch (error) {
    // A provider outage or a network failure. Logged and swallowed - no token
    // is deactivated, because nothing here says any token is bad.
    summary.failed += 1;
    console.error(
      `[push] send failed ${JSON.stringify({
        user_id: String(userId),
        error: error.message,
        timestamp: new Date().toISOString(),
      })}`
    );
  }

  return summary;
}

module.exports = { sendPushToUser, setPushTransport, fingerprint, expoTransport };
