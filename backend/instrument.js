// Loaded as the VERY FIRST line of server.js, before anything else is
// required. That ordering is not stylistic.
//
// Sentry instruments Express, Mongoose and Node's http module by patching
// them as they are loaded. A module already in Node's require cache when
// Sentry starts is never patched, so initialising Sentry alongside the other
// requires in server.js would produce an SDK that reports manually captured
// errors but silently misses everything it was supposed to pick up
// automatically - unhandled route errors, database spans, outbound HTTP
// breadcrumbs. The symptom is an integration that looks installed and is
// half-blind, which is the worst kind of monitoring bug because it is
// invisible until the incident it was meant to catch.
//
// dotenv runs here too, for the same reason in miniature: Sentry.init needs
// SENTRY_DSN, and server.js's own dotenv call has not happened yet.
//
// Everything here is optional and silent when unconfigured - see
// config/observability.js for why an unconfigured reporter must behave
// exactly like a provider outage.
require("dotenv").config();

const { initSentry } = require("./utils/sentry");

initSentry();
