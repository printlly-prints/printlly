const express = require("express");
const { health, ready } = require("../controllers/healthController");

// Health and readiness probes.
//
// NO AUTHENTICATION, and no rate limiter. Both are deliberate.
//
// Authentication: an external uptime monitor has no credentials and cannot be
// given any safely - a token embedded in a third-party monitoring service is
// a token that has left our control. See controllers/healthController.js for
// what the responses therefore deliberately omit.
//
// Rate limiting: these are mounted in server.js ahead of every limiter, for
// the same reason the existing "/" health check is. A monitor polls from one
// address on a fixed interval forever; metering it would eventually produce a
// 429, and a 429 is not a 200, so the monitor would declare a perfectly
// healthy server down. A probe that triggers the alert it exists to prevent
// is worse than no probe.
//
// Both handlers are cheap by design - / health touches nothing at all, and
// /health/ready issues one database ping with a short timeout - so leaving
// them unmetered is not an abuse surface worth the false alarms.
const router = express.Router();

router.get("/", health);
router.get("/ready", ready);

module.exports = router;
