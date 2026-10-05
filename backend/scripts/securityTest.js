// Tests the P1 security hardening: the CORS allowlist (Express + Socket.io),
// the rate-limit policies, and the client-identity/proxy handling the
// limiters depend on.
//
// Runs against real Express apps and a real Socket.io server on ephemeral
// ports, using the actual middleware the production server mounts - not
// re-implementations of it.
//
// The CORS, header and rate-limit sections need no database: nothing in them
// reaches a controller. The Socket.io section does, and only since JWT
// revocation was added - the handshake now consults the session record
// (middleware/auth.js), so proving that a VALID token still connects requires
// a real user and a real session to exist. It connects to MongoDB for that
// one check and removes the throwaway account afterwards.
//
// The limits are deliberately turned down to single digits (see the env
// block below, which must run BEFORE middleware/rateLimit.js is required,
// since each policy reads its numbers once at module load). Testing with
// the real production numbers would mean firing 600 requests to prove one
// 429, which tests the loop rather than the limiter. The behaviour under
// test - when a 429 happens, what it says, and whose bucket was spent - is
// the same at any limit.
//
// A note on what can and cannot be tested from Node: a browser is the thing
// that enforces CORS, and the Node socket.io-client ignores CORS headers
// entirely. So the Socket.io origin tests assert on the handshake response
// headers - exactly the bytes a browser decides on - rather than on whether
// a Node client managed to connect, which it always would.
//
// Run with: node scripts/securityTest.js
require("dotenv").config();

process.env.RATE_LIMIT_AUTH_WINDOW_MS = "60000";
process.env.RATE_LIMIT_AUTH_MAX = "3";
process.env.RATE_LIMIT_GENERAL_WINDOW_MS = "60000";
process.env.RATE_LIMIT_GENERAL_MAX = "5";
process.env.RATE_LIMIT_OTP_WINDOW_MS = "60000";
process.env.RATE_LIMIT_OTP_MAX = "2";
process.env.RATE_LIMIT_ENABLED = "true";
delete process.env.NODE_ENV;
delete process.env.TRUST_PROXY;

const http = require("http");
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const { io: ioClient } = require("socket.io-client");

const {
  parseOriginList,
  resolveAllowedOrigins,
  isOriginAllowed,
  buildCorsOptions,
  buildHelmetOptions,
  resolveTrustProxy,
} = require("../config/security");
const {
  authLimiter,
  otpVerifyLimiter,
  generalLimiter,
  identityKey,
} = require("../middleware/rateLimit");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};
const section = (title) => console.log(`\n--- ${title} ---`);

const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.message;
  }
};

// Starts an app on an ephemeral port and returns its base URL plus a close
// function. Port 0 so parallel runs, or a leftover server from an aborted
// run, cannot collide.
function listen(appOrServer) {
  return new Promise((resolve) => {
    const server = appOrServer instanceof http.Server ? appOrServer : http.createServer(appOrServer);
    server.listen(0, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, server });
    });
  });
}

const signToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET);

async function main() {
  // =========================================================================
  section("CORS configuration parsing and validation");
  // =========================================================================

  const prodEnv = {
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://dashboard.printlly.com,https://admin.printlly.com",
  };

  check(
    isOriginAllowed("https://dashboard.printlly.com", prodEnv),
    "an allowed production origin is accepted"
  );
  check(
    isOriginAllowed("https://admin.printlly.com", prodEnv),
    "a second configured origin is accepted too (multiple origins)"
  );
  check(
    resolveAllowedOrigins(prodEnv).length === 2,
    "both configured origins are on the resolved allowlist",
    JSON.stringify(resolveAllowedOrigins(prodEnv))
  );
  check(
    isOriginAllowed("https://evil.example.com", prodEnv) === false,
    "a disallowed origin is rejected"
  );
  check(
    isOriginAllowed("https://dashboard.printlly.com.evil.com", prodEnv) === false,
    "a lookalike origin that merely starts with an allowed one is rejected"
  );
  check(
    isOriginAllowed("http://dashboard.printlly.com", prodEnv) === false,
    "the same host over http is NOT accepted when the allowlist says https"
  );
  check(
    isOriginAllowed("http://localhost:5173", prodEnv) === false,
    "localhost is NOT allowed in production"
  );

  const devEnv = { CORS_ALLOWED_ORIGINS: "" };
  check(isOriginAllowed("http://localhost:5173", devEnv), "development: the vendor dashboard on localhost:5173 is allowed");
  check(isOriginAllowed("http://localhost:5174", devEnv), "development: any localhost port is allowed (Vite picks a free one)");
  check(isOriginAllowed("http://127.0.0.1:5173", devEnv), "development: 127.0.0.1 is allowed");
  check(isOriginAllowed("exp://192.168.1.5:19000", devEnv), "development: the Expo dev client scheme is allowed");
  check(
    isOriginAllowed("https://evil.example.com", devEnv) === false,
    "development convenience does not extend to arbitrary remote origins"
  );

  // The one that matters most: a production deploy that forgot to configure
  // the allowlist must refuse to start, not fall back to allowing everyone.
  const prodMissing = throws(() => resolveAllowedOrigins({ NODE_ENV: "production" }));
  check(
    typeof prodMissing === "string" && /NODE_ENV=production/.test(prodMissing),
    "production with no allowlist fails at startup instead of falling back to *",
    prodMissing ? prodMissing.slice(0, 60) + "..." : "DID NOT THROW"
  );
  check(
    throws(() => buildCorsOptions({ NODE_ENV: "production" })) !== null,
    "building the CORS options in that state throws too (so server.js cannot boot)"
  );
  check(
    resolveAllowedOrigins({ NODE_ENV: "production", FRONTEND_URL: "https://app.printlly.com" }).length === 1,
    "FRONTEND_URL alone satisfies the production requirement (it is folded into the allowlist)"
  );

  check(throws(() => parseOriginList("*")) !== null, 'an allowlist of "*" is rejected as configuration');
  check(throws(() => parseOriginList("https://a.com,*")) !== null, 'a smuggled "*" among valid origins is rejected');
  check(throws(() => parseOriginList("not-a-url")) !== null, "a malformed origin is rejected at startup");
  check(throws(() => parseOriginList("https://a.com/dashboard")) !== null, "an entry with a path is rejected (an Origin header never has one)");
  check(throws(() => parseOriginList("ftp://a.com")) !== null, "a non-http(s) scheme is rejected");
  check(
    JSON.stringify(parseOriginList(" https://a.com , https://b.com ,, https://a.com ")) ===
      JSON.stringify(["https://a.com", "https://b.com"]),
    "the list is trimmed, de-duplicated and tolerant of empty entries"
  );
  check(isOriginAllowed(undefined, prodEnv), "a request with NO Origin header is allowed (the Expo app, curl, the e2e suite)");

  // =========================================================================
  section("CORS over HTTP (real cors middleware, production allowlist)");
  // =========================================================================

  const corsApp = express();
  corsApp.use(cors(buildCorsOptions(prodEnv)));
  corsApp.get("/shops", (req, res) => res.json({ ok: true }));
  const corsSrv = await listen(corsApp);

  const allowedGet = await fetch(`${corsSrv.url}/shops`, {
    headers: { Origin: "https://dashboard.printlly.com" },
  });
  check(
    allowedGet.headers.get("access-control-allow-origin") === "https://dashboard.printlly.com",
    "allowed origin receives Access-Control-Allow-Origin echoing its own origin",
    allowedGet.headers.get("access-control-allow-origin")
  );
  check(
    (allowedGet.headers.get("vary") || "").includes("Origin"),
    "the response varies on Origin, so a cache cannot serve it to a different origin",
    allowedGet.headers.get("vary")
  );
  check(
    allowedGet.headers.get("access-control-allow-origin") !== "*",
    "the wildcard is never sent"
  );

  const deniedGet = await fetch(`${corsSrv.url}/shops`, {
    headers: { Origin: "https://evil.example.com" },
  });
  check(
    deniedGet.headers.get("access-control-allow-origin") === null,
    "disallowed origin receives NO permissive CORS header (the browser blocks the read)",
    String(deniedGet.headers.get("access-control-allow-origin"))
  );

  // Preflight. Every authenticated cross-origin call from the dashboards
  // sends one of these first, because Authorization is not a safelisted
  // header - if the preflight fails, nothing else works.
  const allowedPreflight = await fetch(`${corsSrv.url}/shops`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://admin.printlly.com",
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  check(allowedPreflight.status === 204, "preflight from an allowed origin returns 204", String(allowedPreflight.status));
  check(
    allowedPreflight.headers.get("access-control-allow-origin") === "https://admin.printlly.com",
    "preflight from an allowed origin is granted"
  );
  check(
    (allowedPreflight.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    "preflight permits the Authorization header (without this every authenticated call fails)",
    allowedPreflight.headers.get("access-control-allow-headers")
  );
  check(
    (allowedPreflight.headers.get("access-control-allow-methods") || "").includes("PATCH"),
    "preflight permits PATCH (used across the vendor and admin APIs)",
    allowedPreflight.headers.get("access-control-allow-methods")
  );
  check(
    allowedPreflight.headers.get("access-control-allow-credentials") === null,
    "credentials are not enabled by default (no cookie auth exists in this app)"
  );

  const deniedPreflight = await fetch(`${corsSrv.url}/shops`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example.com",
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  check(
    deniedPreflight.headers.get("access-control-allow-origin") === null,
    "preflight from a disallowed origin is not granted"
  );
  check(
    deniedPreflight.status < 500,
    "a disallowed preflight is a refusal, not a 500 (the server is not broken, the origin is not allowed)",
    String(deniedPreflight.status)
  );

  const credEnv = { ...prodEnv, CORS_ALLOW_CREDENTIALS: "true" };
  check(
    buildCorsOptions(credEnv).credentials === true,
    "credentials mode can be switched on by configuration if cookie auth is ever added"
  );

  corsSrv.server.close();

  // =========================================================================
  section("Client identity and proxy handling");
  // =========================================================================

  check(resolveTrustProxy({}) === false, "trust proxy defaults to OFF when TRUST_PROXY is unset");
  check(resolveTrustProxy({ TRUST_PROXY: "false" }) === false, 'TRUST_PROXY="false" is off');
  check(resolveTrustProxy({ TRUST_PROXY: "true" }) === true, 'TRUST_PROXY="true" trusts every hop');
  check(resolveTrustProxy({ TRUST_PROXY: "1" }) === 1, 'TRUST_PROXY="1" is the number 1, not the string (Express treats them differently)');
  check(resolveTrustProxy({ TRUST_PROXY: "loopback" }) === "loopback", 'TRUST_PROXY="loopback" is passed through');
  check(
    JSON.stringify(resolveTrustProxy({ TRUST_PROXY: "10.0.0.1, 10.0.0.2" })) ===
      JSON.stringify(["10.0.0.1", "10.0.0.2"]),
    "a comma-separated proxy list becomes an array"
  );

  // Two apps, identical but for the trust-proxy setting, both reporting the
  // key the limiters would actually use. This is the difference between
  // "every production request looks like one proxy IP" and correct per-client
  // limiting.
  const makeIdentityApp = (trustProxy) => {
    const app = express();
    app.set("trust proxy", trustProxy);
    app.get("/whoami", (req, res) => res.json({ key: identityKey(req), ip: req.ip }));
    return app;
  };

  const noProxy = await listen(makeIdentityApp(false));
  const withProxy = await listen(makeIdentityApp(1));
  const forged = { "X-Forwarded-For": "203.0.113.7" };

  const noProxyId = await (await fetch(`${noProxy.url}/whoami`, { headers: forged })).json();
  check(
    !noProxyId.key.includes("203.0.113.7"),
    "trust proxy OFF: a forged X-Forwarded-For is ignored, so nobody can reset their own limit by setting a header",
    noProxyId.key
  );

  const withProxyId = await (await fetch(`${withProxy.url}/whoami`, { headers: forged })).json();
  check(
    withProxyId.key === "ip:203.0.113.7",
    "trust proxy ON (1 hop): the real client IP from X-Forwarded-For is used, not the proxy's address",
    withProxyId.key
  );

  // The forgery case for a real single-proxy deployment. A client that sends
  // its own X-Forwarded-For has that value sitting to the LEFT of the
  // address the proxy actually observed, because each hop appends. With one
  // trusted hop, the rightmost entry - 70.41.3.18, what our proxy saw - is
  // the furthest left we are entitled to believe, so that is what Express
  // must use. Taking the leftmost value instead would be reading the part
  // the client wrote, which is the whole X-Forwarded-For spoofing problem.
  const forgedChain = await (
    await fetch(`${withProxy.url}/whoami`, {
      headers: { "X-Forwarded-For": "203.0.113.9, 70.41.3.18" },
    })
  ).json();
  check(
    forgedChain.key === "ip:70.41.3.18",
    "with one trusted hop, the identity is the address that hop observed - not a value the client prepended to the chain",
    forgedChain.key
  );

  const twoHopApp = await listen(makeIdentityApp(2));
  const twoHops = await (
    await fetch(`${twoHopApp.url}/whoami`, {
      headers: { "X-Forwarded-For": "203.0.113.9, 70.41.3.18" },
    })
  ).json();
  check(
    twoHops.key === "ip:203.0.113.9",
    "configuring two hops walks one further left, so the hop count must match the real topology (this is why TRUST_PROXY is not just true/false)",
    twoHops.key
  );
  twoHopApp.server.close();

  const tokenA = signToken("64b000000000000000000001", "customer");
  const tokenB = signToken("64b000000000000000000002", "customer");

  const idA = await (
    await fetch(`${noProxy.url}/whoami`, { headers: { Authorization: `Bearer ${tokenA}` } })
  ).json();
  const idB = await (
    await fetch(`${noProxy.url}/whoami`, { headers: { Authorization: `Bearer ${tokenB}` } })
  ).json();
  check(idA.key.startsWith("user:"), "an authenticated request is keyed by user id, not by IP", idA.key);
  check(idA.key !== idB.key, "two different authenticated users get different keys (they are not grouped together)");

  // The NAT case this whole identity scheme exists for: same address, two
  // customers, separate budgets.
  check(
    idA.key !== noProxyId.key && idB.key !== noProxyId.key,
    "authenticated users are not bucketed with the anonymous traffic from their shared carrier IP"
  );

  const idForged = await (
    await fetch(`${withProxy.url}/whoami`, {
      headers: { Authorization: `Bearer ${tokenA}`, ...forged },
    })
  ).json();
  check(
    idForged.key === idA.key,
    "a user's key does not change when their IP does (so roaming between wifi and mobile does not reset or split a limit)",
    idForged.key
  );

  const idGarbage = await (
    await fetch(`${noProxy.url}/whoami`, { headers: { Authorization: "Bearer not.a.real.token" } })
  ).json();
  check(
    idGarbage.key.startsWith("ip:"),
    "an unverifiable token gets NO user bucket - it falls back to IP, so forged tokens cannot buy a fresh allowance",
    idGarbage.key
  );

  noProxy.server.close();
  withProxy.server.close();

  // =========================================================================
  section("Rate limiting");
  // =========================================================================

  // One app carrying three different policies on three prefixes, mirroring
  // how server.js mounts them.
  const rlApp = express();
  rlApp.set("trust proxy", false);
  rlApp.use(express.json());
  rlApp.get("/", (req, res) => res.json({ message: "health" })); // unmetered, as in server.js
  rlApp.use("/auth", authLimiter);
  rlApp.use("/shops", generalLimiter);
  rlApp.post("/auth/login", (req, res) => res.json({ ok: true }));
  rlApp.get("/shops", (req, res) => res.json({ ok: true }));
  rlApp.patch("/orders/:id/complete", otpVerifyLimiter, (req, res) => {
    // Stands in for the real handler's two outcomes: wrong OTP -> 400,
    // correct OTP -> 200.
    if (req.body?.otp === "123456") return res.json({ ok: true });
    return res.status(400).json({ message: "OTP does not match" });
  });
  const rl = await listen(rlApp);

  const hit = (path, { method = "GET", token, body, headers = {} } = {}) =>
    fetch(`${rl.url}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  // GENERAL policy: limit 5.
  const userC = signToken("64b000000000000000000003", "customer");
  const belowLimit = [];
  for (let i = 0; i < 5; i++) belowLimit.push((await hit("/shops", { token: userC })).status);
  check(
    belowLimit.every((s) => s === 200),
    "requests below the limit all succeed",
    `statuses ${belowLimit.join(",")} (limit 5)`
  );

  const firstOver = await hit("/shops", { token: userC });
  check(firstOver.status === 429, "the request over the limit returns 429", String(firstOver.status));

  const overBody = await firstOver.json();
  const retryAfterHeader = Number(firstOver.headers.get("retry-after"));
  check(
    Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 && retryAfterHeader <= 60,
    "Retry-After is present and within the 60s window",
    `${firstOver.headers.get("retry-after")}s`
  );
  check(
    Number.isFinite(overBody.retry_after_seconds) && overBody.retry_after_seconds === retryAfterHeader,
    "the JSON body carries the same retry delay as the header (the mobile app reads the body)",
    JSON.stringify(overBody)
  );
  check(typeof overBody.message === "string" && overBody.message.length > 0, "the 429 explains itself in plain language", overBody.message);
  check(
    firstOver.headers.get("ratelimit") !== null || firstOver.headers.get("ratelimit-limit") !== null,
    "standard RateLimit headers are sent",
    firstOver.headers.get("ratelimit") || firstOver.headers.get("ratelimit-limit")
  );
  check(
    firstOver.headers.get("x-ratelimit-limit") === null,
    "the deprecated X-RateLimit-* headers are not sent"
  );

  // Separate policies: the exhausted GENERAL bucket must not have spent the
  // AUTH allowance, and vice versa.
  const authAfterGeneral = await hit("/auth/login", {
    method: "POST",
    token: userC,
    body: { email: "someone@example.com", password: "x" },
  });
  check(
    authAfterGeneral.status === 200,
    "exhausting the general policy does NOT exhaust the auth policy (separate limiters really apply)",
    String(authAfterGeneral.status)
  );

  // Authenticated users are not grouped: user C is blocked, user D is not.
  const userD = signToken("64b000000000000000000004", "customer");
  const otherUser = await hit("/shops", { token: userD });
  check(
    otherUser.status === 200,
    "a second user on the same IP is unaffected by the first user hitting their limit",
    String(otherUser.status)
  );

  // Health check must stay open - a platform probe hits it constantly.
  const healthChecks = [];
  for (let i = 0; i < 12; i++) healthChecks.push((await fetch(`${rl.url}/`)).status);
  check(
    healthChecks.every((s) => s === 200),
    "the health check is never rate-limited",
    `${healthChecks.length} consecutive probes, all ${healthChecks[0]}`
  );

  // Preflights are not counted against the limit.
  const userE = signToken("64b000000000000000000005", "customer");
  for (let i = 0; i < 8; i++) {
    await fetch(`${rl.url}/shops`, {
      method: "OPTIONS",
      headers: { Authorization: `Bearer ${userE}`, Origin: "http://localhost:5173" },
    });
  }
  const afterPreflights = await hit("/shops", { token: userE });
  check(
    afterPreflights.status === 200,
    "preflight requests do not consume the allowance (8 preflights, real request still served)",
    String(afterPreflights.status)
  );

  // AUTH policy: limit 3, keyed by IP + the email being targeted. A spray
  // against one account must stop without locking out a different account
  // from the same address.
  const target = { email: "victim@example.com", password: "guess" };
  const sprayStatuses = [];
  for (let i = 0; i < 4; i++) {
    sprayStatuses.push((await hit("/auth/login", { method: "POST", body: target })).status);
  }
  check(
    sprayStatuses.slice(0, 3).every((s) => s === 200) && sprayStatuses[3] === 429,
    "login attempts against one account are cut off after the limit",
    `statuses ${sprayStatuses.join(",")} (limit 3)`
  );

  const differentAccount = await hit("/auth/login", {
    method: "POST",
    body: { email: "someone-else@example.com", password: "x" },
  });
  check(
    differentAccount.status === 200,
    "a different account from the same IP can still sign in (one targeted account being sprayed does not lock out the office)",
    String(differentAccount.status)
  );

  // OTP policy: limit 2, and only wrong codes count.
  const shopOwner = signToken("64b000000000000000000006", "shop_owner");
  const orderOne = "64c000000000000000000001";
  const orderTwo = "64c000000000000000000002";

  const guesses = [];
  for (let i = 0; i < 3; i++) {
    guesses.push(
      (
        await hit(`/orders/${orderOne}/complete`, {
          method: "PATCH",
          token: shopOwner,
          body: { otp: "000000" },
        })
      ).status
    );
  }
  check(
    guesses.slice(0, 2).every((s) => s === 400) && guesses[2] === 429,
    "wrong pickup codes are cut off after the limit (a 6-digit OTP cannot be brute-forced)",
    `statuses ${guesses.join(",")} (limit 2)`
  );

  const otherOrder = await hit(`/orders/${orderTwo}/complete`, {
    method: "PATCH",
    token: shopOwner,
    body: { otp: "123456" },
  });
  check(
    otherOrder.status === 200,
    "the OTP budget is per order, so a busy shop completing other pickups is unaffected",
    String(otherOrder.status)
  );

  // Successful completions are refunded, so a shop that completes pickups
  // correctly all day never approaches the limit.
  const orderThree = "64c000000000000000000003";
  const correctRun = [];
  for (let i = 0; i < 6; i++) {
    correctRun.push(
      (
        await hit(`/orders/${orderThree}/complete`, {
          method: "PATCH",
          token: shopOwner,
          body: { otp: "123456" },
        })
      ).status
    );
  }
  check(
    correctRun.every((s) => s === 200),
    "correct pickup codes are refunded and never trip the limit (6 successes against a limit of 2)",
    `statuses ${correctRun.join(",")}`
  );

  // The switch the e2e suite can use, proven to actually switch things off.
  process.env.RATE_LIMIT_ENABLED = "false";
  const disabled = [];
  for (let i = 0; i < 8; i++) disabled.push((await hit("/shops", { token: userC })).status);
  process.env.RATE_LIMIT_ENABLED = "true";
  check(
    disabled.every((s) => s === 200),
    "RATE_LIMIT_ENABLED=false bypasses the limiters, including for an already-blocked user",
    `${disabled.length} requests, all ${disabled[0]}`
  );

  const stillLimited = await hit("/shops", { token: userC });
  check(
    stillLimited.status === 429,
    "...and turning it back on restores the limit immediately (the flag is read per request, not cached at boot)",
    String(stillLimited.status)
  );

  rl.server.close();

  // =========================================================================
  section("HTTP security headers (helmet)");
  // =========================================================================

  // An app assembled in the same order as server.js - helmet first, then
  // CORS, then the body parser, then a limiter - so that what is asserted is
  // the interaction between them and not helmet in isolation.
  const makeHardenedApp = (env) => {
    const app = express();
    app.set("trust proxy", false);
    app.use(helmet(buildHelmetOptions(env)));
    app.use(cors(buildCorsOptions(env)));
    app.use(express.json());
    app.get("/", (req, res) => res.json({ message: "Print marketplace API is running" }));
    app.get("/pricing-config", generalLimiter, (req, res) => res.json({ platform_fee: 5 }));
    app.get("/shops", generalLimiter, (req, res) => res.json([{ name: "a shop" }]));
    // Stands in for GET /orders/:id/documents/:index/view, which streams a
    // customer PDF from this origin.
    app.get("/orders/:id/documents/:index/view", (req, res) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).send(Buffer.from("%PDF-1.4 fake test document"));
    });
    // Stands in for the two Google OAuth routes, both of which are 302
    // redirects rather than documents.
    app.get("/auth/google", (req, res) =>
      res.redirect("https://accounts.google.com/o/oauth2/v2/auth?client_id=x")
    );
    app.get("/auth/google/callback", (req, res) =>
      res.redirect("http://localhost:5173/auth/callback?code=one-time-code")
    );
    return app;
  };

  const devHardened = await listen(makeHardenedApp({ CORS_ALLOWED_ORIGINS: "" }));
  const prodHardened = await listen(makeHardenedApp(prodEnv));

  const h = (res, name) => res.headers.get(name);

  // --- the headers the brief asks for, on an ordinary API response ---
  const apiRes = await fetch(`${devHardened.url}/pricing-config`);
  check(apiRes.status === 200, "a public API endpoint still returns 200 with helmet mounted", String(apiRes.status));
  check((await apiRes.clone().json()).platform_fee === 5, "...and its JSON body is unchanged");
  check(h(apiRes, "x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff", h(apiRes, "x-content-type-options"));
  check(h(apiRes, "x-frame-options") === "DENY", "X-Frame-Options: DENY (stricter than helmet's SAMEORIGIN default)", h(apiRes, "x-frame-options"));
  check(h(apiRes, "referrer-policy") === "no-referrer", "Referrer-Policy: no-referrer", h(apiRes, "referrer-policy"));
  check(h(apiRes, "cross-origin-resource-policy") === "same-origin", "Cross-Origin-Resource-Policy: same-origin", h(apiRes, "cross-origin-resource-policy"));
  check(h(apiRes, "cross-origin-opener-policy") === "same-origin", "Cross-Origin-Opener-Policy: same-origin", h(apiRes, "cross-origin-opener-policy"));
  check(h(apiRes, "x-permitted-cross-domain-policies") === "none", "X-Permitted-Cross-Domain-Policies: none", h(apiRes, "x-permitted-cross-domain-policies"));
  check(h(apiRes, "origin-agent-cluster") === "?1", "Origin-Agent-Cluster: ?1", h(apiRes, "origin-agent-cluster"));
  check(h(apiRes, "x-xss-protection") === "0", "X-XSS-Protection: 0 (the legacy auditor is disabled, which is current practice)", h(apiRes, "x-xss-protection"));
  check(h(apiRes, "x-powered-by") === null, "X-Powered-By is removed, so the server no longer advertises Express");

  // --- CSP: the shape chosen for an API that serves no markup ---
  const csp = h(apiRes, "content-security-policy") || "";
  check(/default-src 'none'/.test(csp), "CSP: default-src 'none' (an API should load no scripts, styles, fonts or images)", csp.slice(0, 60));
  check(/frame-ancestors 'none'/.test(csp), "CSP: frame-ancestors 'none' (modern equivalent of the frame protection above)");
  check(/base-uri 'none'/.test(csp), "CSP: base-uri 'none'");
  check(/form-action 'none'/.test(csp), "CSP: form-action 'none'");
  check(!/script-src 'self'/.test(csp), "CSP does NOT keep helmet's default script-src 'self' (nothing here should ever run a script)");
  check(!/unsafe-inline/.test(csp), "CSP does NOT contain 'unsafe-inline', which helmet's default style-src allows");
  check(
    /object-src 'self'/.test(csp),
    "CSP: object-src 'self' - the one deliberate relaxation, so a streamed PDF opened directly still renders in Chrome's plugin-based viewer",
    (csp.match(/object-src [^;]*/) || [])[0]
  );

  // --- HSTS: production only ---
  check(
    h(apiRes, "strict-transport-security") === null,
    "HSTS is NOT sent in development (a browser ignores it over http, and asserting it would pin every localhost port to https)"
  );
  const prodApiRes = await fetch(`${prodHardened.url}/pricing-config`);
  const hsts = h(prodApiRes, "strict-transport-security") || "";
  check(/max-age=31536000/.test(hsts), "HSTS is sent in production with a one-year max-age", hsts);
  check(/includeSubDomains/.test(hsts), "HSTS includes subdomains");
  check(!/preload/.test(hsts), "HSTS does NOT claim preload (that is a hard-to-reverse commitment, not a default)");
  check(
    h(prodApiRes, "content-security-policy") === h(apiRes, "content-security-policy"),
    "every other header is identical in development and production, so what is tested locally is what ships"
  );

  // --- COEP stays off, deliberately ---
  check(
    h(apiRes, "cross-origin-embedder-policy") === null,
    "Cross-Origin-Embedder-Policy is not set (it would require every subresource to opt in, for isolation this API has no use for)"
  );

  // --- the headers must reach responses that never touch a route handler ---
  const healthRes = await fetch(`${devHardened.url}/`);
  check(
    h(healthRes, "x-content-type-options") === "nosniff" && h(healthRes, "x-frame-options") === "DENY",
    "GET / (the unmetered health check) carries the security headers too"
  );

  const userH = signToken("64b00000000000000000000a", "customer");
  const authedRes = await fetch(`${devHardened.url}/shops`, { headers: { Authorization: `Bearer ${userH}` } });
  check(authedRes.status === 200, "an authenticated API request still succeeds", String(authedRes.status));
  check(
    h(authedRes, "x-content-type-options") === "nosniff" && h(authedRes, "content-security-policy") !== null,
    "an authenticated response carries the security headers"
  );
  check(
    h(authedRes, "ratelimit") !== null,
    "the existing RateLimit headers survive helmet (the two middlewares do not fight over headers)",
    h(authedRes, "ratelimit")
  );

  // Helmet sits ahead of the limiters, so a 429 is hardened as well - it is
  // still a response this server sent.
  let limited = null;
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`${devHardened.url}/shops`, { headers: { Authorization: `Bearer ${userH}` } });
    if (r.status === 429) {
      limited = r;
      break;
    }
  }
  check(limited !== null, "the limiter still fires with helmet in front of it", limited ? "429 observed" : "no 429");
  check(
    limited && h(limited, "x-content-type-options") === "nosniff" && h(limited, "x-frame-options") === "DENY",
    "a 429 response carries the security headers (helmet is mounted before the limiters)"
  );
  check(
    limited && Number(h(limited, "retry-after")) > 0,
    "...and its Retry-After is intact",
    limited ? h(limited, "retry-after") : ""
  );

  // --- CORS must still work with helmet in front of it ---
  const corsWithHelmet = await fetch(`${prodHardened.url}/shops`, {
    headers: { Origin: "https://admin.printlly.com" },
  });
  check(
    h(corsWithHelmet, "access-control-allow-origin") === "https://admin.printlly.com",
    "the CORS allowlist still grants an allowed origin with helmet mounted first"
  );
  check(
    h(corsWithHelmet, "x-content-type-options") === "nosniff",
    "...and that response carries the security headers as well"
  );

  const preflightWithHelmet = await fetch(`${prodHardened.url}/shops`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://admin.printlly.com",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization",
    },
  });
  check(preflightWithHelmet.status === 204, "preflight still returns 204 with helmet mounted", String(preflightWithHelmet.status));
  check(
    h(preflightWithHelmet, "access-control-allow-origin") === "https://admin.printlly.com" &&
      (h(preflightWithHelmet, "access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    "preflight still grants the origin and the Authorization header (the admin dashboard keeps working)"
  );

  const deniedWithHelmet = await fetch(`${prodHardened.url}/shops`, {
    headers: { Origin: "https://evil.example.com" },
  });
  check(
    h(deniedWithHelmet, "access-control-allow-origin") === null && h(deniedWithHelmet, "x-frame-options") === "DENY",
    "a CORS-refused response is still hardened (helmet runs before the refusal)"
  );

  // --- document streaming must be untouched ---
  const docRes = await fetch(`${devHardened.url}/orders/abc/documents/0/view`, {
    headers: { Authorization: `Bearer ${userH}` },
  });
  check(docRes.status === 200, "the document-view endpoint still returns the file", String(docRes.status));
  check(h(docRes, "content-type") === "application/pdf", "its Content-Type is still application/pdf - helmet did not rewrite it", h(docRes, "content-type"));
  check(h(docRes, "content-disposition") === "inline", "its inline Content-Disposition survives", h(docRes, "content-disposition"));
  check(h(docRes, "cache-control") === "private, no-store", "its private, no-store caching rule survives (helmet does not set Cache-Control)", h(docRes, "cache-control"));
  check((await docRes.text()).startsWith("%PDF"), "the PDF bytes arrive unmodified");
  check(
    h(docRes, "x-content-type-options") === "nosniff",
    "the document response is hardened too, and nosniff is correct here because the Content-Type is declared accurately"
  );

  // --- OAuth redirects must be untouched ---
  const oauthStart = await fetch(`${devHardened.url}/auth/google`, { redirect: "manual" });
  check(oauthStart.status === 302, "GET /auth/google still issues a 302 to Google", String(oauthStart.status));
  check(
    (oauthStart.headers.get("location") || "").startsWith("https://accounts.google.com/"),
    "...to the correct Location, unmodified by helmet",
    oauthStart.headers.get("location")
  );

  const oauthCallback = await fetch(`${devHardened.url}/auth/google/callback`, { redirect: "manual" });
  check(oauthCallback.status === 302, "the OAuth callback still redirects to the dashboard", String(oauthCallback.status));
  check(
    (oauthCallback.headers.get("location") || "").includes("/auth/callback?code="),
    "...carrying the one-time code, so the exchange-code step is unaffected",
    oauthCallback.headers.get("location")
  );
  check(
    h(oauthCallback, "referrer-policy") === "no-referrer",
    "the callback redirect is sent with Referrer-Policy: no-referrer, which stops that one-time code leaking through a Referer header"
  );

  devHardened.server.close();
  prodHardened.server.close();

  // =========================================================================
  section("Socket.io CORS (same allowlist, authentication unchanged)");
  // =========================================================================

  // The real initSocket, so what is tested is the server the app actually
  // runs - including its JWT handshake middleware.
  process.env.CORS_ALLOWED_ORIGINS = "https://admin.printlly.com";
  delete process.env.FRONTEND_URL;
  // Required so the module reads the production allowlist rather than the
  // development localhost rule - the point is to prove the production path.
  process.env.NODE_ENV = "production";

  // initSocket caches the allowlist at call time, so it must be required
  // only now that the env above is in place.
  const { initSocket } = require("../config/socket");
  // Helmet is mounted on this app exactly as server.js mounts it, so the
  // handshake below is tested under the real middleware stack.
  const socketApp = express();
  socketApp.use(helmet(buildHelmetOptions({ NODE_ENV: "production" })));
  const socketServer = http.createServer(socketApp);
  const socketIo = initSocket(socketServer);
  const sock = await listen(socketServer);

  const handshake = (origin) =>
    fetch(`${sock.url}/socket.io/?EIO=4&transport=polling`, {
      headers: origin ? { Origin: origin } : {},
    });

  const allowedShake = await handshake("https://admin.printlly.com");
  check(
    allowedShake.headers.get("access-control-allow-origin") === "https://admin.printlly.com",
    "Socket.io handshake from an allowed origin receives the CORS header",
    allowedShake.headers.get("access-control-allow-origin")
  );

  const deniedShake = await handshake("https://evil.example.com");
  check(
    deniedShake.headers.get("access-control-allow-origin") === null,
    "Socket.io handshake from a disallowed origin receives NO CORS header (the browser refuses the connection)",
    String(deniedShake.headers.get("access-control-allow-origin"))
  );
  check(
    deniedShake.headers.get("access-control-allow-origin") !== "*",
    "Socket.io no longer answers with the wildcard it used to"
  );

  const noOriginShake = await handshake(null);
  check(
    noOriginShake.status === 200,
    "a handshake with no Origin header still works (the Expo app connects this way)",
    String(noOriginShake.status)
  );

  // Worth asserting rather than assuming: engine.io attaches to the HTTP
  // server's request event and answers /socket.io/ before Express sees it,
  // so helmet's headers are NOT on the handshake response. That is why this
  // check is written as an observation of where the boundary is, not as a
  // requirement that the headers be there - and it is also why helmet could
  // not have broken the handshake even if its policy were wrong.
  check(
    allowedShake.status === 200,
    "the Socket.io handshake still succeeds with helmet mounted on the same server",
    `status ${allowedShake.status}, helmet headers present on handshake: ${
      allowedShake.headers.get("x-frame-options") !== null
    }`
  );

  const localhostInProd = await handshake("http://localhost:5173");
  check(
    localhostInProd.headers.get("access-control-allow-origin") === null,
    "Socket.io does not allow localhost in production either (one allowlist, both halves)"
  );

  // Functionality and auth model must be untouched by any of the above.
  const connectWith = (token) =>
    new Promise((resolve) => {
      const client = ioClient(sock.url, {
        auth: token ? { token } : {},
        transports: ["websocket"],
        reconnection: false,
        timeout: 4000,
      });
      const done = (result) => {
        client.close();
        resolve(result);
      };
      client.on("connect", () => done({ connected: true }));
      client.on("connect_error", (error) => done({ connected: false, error: error.message }));
    });

  // A valid token now means: correct signature AND a live session record for
  // an existing user. Signing a token for a made-up id is no longer enough,
  // so a real throwaway account and session are created for this one check.
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require("../models/User");
  const Session = require("../models/Session");
  const stamp = Date.now().toString(36);
  const socketUser = await User.create({
    name: "Security Test Socket",
    email: `sectest.socket.${stamp}@example.com`,
    phone: `7${String(Date.now()).slice(-9)}`,
    password_hash: "$2a$10$notarealhashnotarealhashnotarealhashnotarealhashnotarealhash",
    role: "customer",
  });
  const socketJti = require("crypto").randomBytes(32).toString("hex");
  await Session.create({
    _id: socketJti,
    user_id: socketUser._id,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
  });
  const liveToken = jwt.sign(
    { id: socketUser._id, role: "customer", jti: socketJti },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const goodSocket = await connectWith(liveToken);
  check(
    goodSocket.connected === true,
    "a client with a valid JWT still connects - realtime support chat is not broken by the CORS or revocation changes",
    JSON.stringify(goodSocket)
  );

  // And the revocation path, on the real initSocket handshake.
  await Session.updateOne({ _id: socketJti }, { $set: { revoked_at: new Date(), revoked_reason: "logout" } });
  const revokedSocket = await connectWith(liveToken);
  check(
    revokedSocket.connected === false,
    "a client whose session has been revoked can no longer connect",
    revokedSocket.error
  );

  await Session.deleteOne({ _id: socketJti });
  await User.deleteOne({ _id: socketUser._id });

  const noTokenSocket = await connectWith(null);
  check(
    noTokenSocket.connected === false && /Unauthorized/.test(noTokenSocket.error || ""),
    "a client with no token is still rejected by the handshake (JWT auth model unchanged)",
    noTokenSocket.error
  );

  const badTokenSocket = await connectWith("not.a.real.token");
  check(
    badTokenSocket.connected === false,
    "a client with an invalid token is still rejected",
    badTokenSocket.error
  );

  socketIo.close();
  socketServer.close();
  await mongoose.disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => {
    // Sockets and servers are all closed above; exit explicitly so a
    // lingering engine.io timer cannot hold the process open.
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  })
  .catch((error) => {
    console.error("\nsecurityTest crashed:", error);
    process.exit(1);
  });
