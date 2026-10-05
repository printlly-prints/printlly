// Parses and validates every security-relevant environment variable ONCE,
// at startup, and hands the result to the three places that need it:
// Express's CORS middleware (server.js), Socket.io's CORS (config/socket.js)
// and the rate limiters (middleware/rateLimit.js).
//
// One module rather than three because an allowlist that applies to the
// REST API but not to Socket.io is not an allowlist - both halves of this
// application are reachable from a browser on the same port, so a gap in
// either is a gap in both.
//
// Validation happens at startup on purpose. A malformed CORS_ALLOWED_ORIGINS
// discovered on the first cross-origin request is a production outage found
// by a customer; discovered at boot it is a deploy that refuses to start.

const isProduction = () => process.env.NODE_ENV === "production";

// Local development origins, allowed only when NODE_ENV is not production.
// Covers both Vite dev servers (vendor dashboard on 5173, admin on its own
// port) without having to enumerate ports that change whenever one is
// already in use, plus Expo's dev-client scheme for the mobile app.
const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/\[::1\](:\d+)?$/,
  /^expo?:\/\//,
];

// Turns "https://a.com, https://b.com" into ["https://a.com","https://b.com"].
// Throws on anything that is not a bare origin, because the silent
// alternative - dropping the malformed entry - produces a server that looks
// configured and rejects the dashboard anyway.
function parseOriginList(raw) {
  if (!raw || typeof raw !== "string") return [];

  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origins = [];
  for (const entry of entries) {
    if (entry === "*") {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must not contain "*". List the exact origins that are allowed to call this API.'
      );
    }

    let url;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains "${entry}", which is not a valid origin. Expected scheme://host[:port], e.g. https://dashboard.printlly.com`
      );
    }

    if (!/^https?:$/.test(url.protocol)) {
      throw new Error(`CORS_ALLOWED_ORIGINS entry "${entry}" must use http:// or https://`);
    }
    // An Origin header is only ever scheme://host:port - never a path. An
    // entry with one would never match anything, so it is a configuration
    // mistake worth surfacing rather than a harmless extra.
    if (url.pathname !== "/" || url.search || url.hash) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS entry "${entry}" must be an origin with no path, query or fragment (use "${url.origin}")`
      );
    }

    if (!origins.includes(url.origin)) origins.push(url.origin);
  }

  return origins;
}

// The effective allowlist. FRONTEND_URL is folded in because the server
// already redirects browsers there after Google OAuth (see
// routes/authRoutes.js) - an origin we hand a token to is one we must also
// accept API calls from, and making that implicit removes a way to
// half-configure the deployment.
function resolveAllowedOrigins(env = process.env) {
  const configured = parseOriginList(env.CORS_ALLOWED_ORIGINS);

  if (env.FRONTEND_URL) {
    for (const origin of parseOriginList(env.FRONTEND_URL)) {
      if (!configured.includes(origin)) configured.push(origin);
    }
  }

  if (configured.length === 0 && env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ALLOWED_ORIGINS is empty but NODE_ENV=production. Refusing to start: a production API must not accept requests from arbitrary origins. Set CORS_ALLOWED_ORIGINS to a comma-separated list of the dashboard/web origins allowed to call this API."
    );
  }

  return configured;
}

// Whether a browser at `origin` may read responses from this API.
//
// A request with NO Origin header is allowed. That is not a loophole being
// left open - it is every non-browser client: the Expo app (React Native's
// fetch sends no Origin), curl, the e2e suite, server-to-server calls.
// CORS is a browser mechanism for protecting a user's credentials in a
// browser; it has never been, and cannot be, an access-control layer
// against clients that simply choose not to send the header. What protects
// those paths is the JWT on every route - see middleware/auth.js.
function isOriginAllowed(origin, env = process.env, allowlist = null) {
  if (!origin) return true;

  const allowed = allowlist || resolveAllowedOrigins(env);
  if (allowed.includes(origin)) return true;

  // Development convenience, explicitly unavailable in production.
  if (env.NODE_ENV !== "production" && DEV_ORIGIN_PATTERNS.some((re) => re.test(origin))) {
    return true;
  }

  return false;
}

// Options for the `cors` package, shared by Express and Socket.io.
//
// An origin that is not on the list is refused by resolving `false`, not by
// raising an error: callback(new Error(...)) would turn a disallowed
// preflight into a 500 from the error handler, which says "this server is
// broken" when the truth is "your origin is not allowed". Resolving false
// sends the response with no Access-Control-Allow-Origin header, which is
// exactly what a browser needs to see in order to block the read.
function buildCorsOptions(env = process.env) {
  const allowlist = resolveAllowedOrigins(env);

  return {
    origin(origin, callback) {
      callback(null, isOriginAllowed(origin, env, allowlist));
    },
    // No cookies or Basic auth are used anywhere in this application - the
    // JWT travels in the Authorization header (vendor-website/src/api/axios.js,
    // userapp/src/api/client.js), which is a plain request header and needs no
    // credentials mode. Left configurable because turning it on later is a
    // deployment decision, but defaulting it off means a mistake in the
    // allowlist cannot be combined with ambient cookie auth.
    credentials: env.CORS_ALLOW_CREDENTIALS === "true",
    // Authorization is not a CORS-safelisted request header, so without it
    // every authenticated cross-origin preflight fails.
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    // Lets the mobile app and dashboards read how long to back off for.
    exposedHeaders: ["Retry-After", "RateLimit", "RateLimit-Policy"],
    optionsSuccessStatus: 204,
  };
}

// Express's `trust proxy` setting, from TRUST_PROXY.
//
// Deliberately NOT defaulted to true. "trust proxy: true" tells Express to
// believe the left-most X-Forwarded-For value it is given, which any client
// can set - on a server that is not actually behind a proxy that hands every
// caller a free way to forge their own IP and so to reset their own rate
// limit. This project currently has no reverse proxy in front of it (no
// Procfile, Dockerfile or platform config in the repo), so the default is
// off, and a real deployment sets this to match its real topology.
//
// Accepted values:
//   unset / "false"  - no proxy (Express default); req.ip is the socket IP
//   "true"           - trust all hops (only behind a proxy that overwrites XFF)
//   a number, e.g. 1 - trust that many hops closest to this server
//   "loopback"       - trust a proxy on this machine
//   a comma list     - trust these specific proxy IPs/CIDRs
function resolveTrustProxy(env = process.env) {
  const raw = (env.TRUST_PROXY || "").trim();

  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  if (/^\d+$/.test(raw)) return Number(raw);

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.length === 1 ? list[0] : list;
}

// Reads one rate-limit policy out of the environment, falling back to the
// built-in default. Defaults are intentionally generous enough that no
// legitimate user meets them, and tight enough to stop automated abuse -
// the point of a limiter here is to make brute-forcing and scraping
// impractical, not to meter normal usage.
function rateLimitPolicy(name, defaults, env = process.env) {
  const windowRaw = Number(env[`RATE_LIMIT_${name}_WINDOW_MS`]);
  const maxRaw = Number(env[`RATE_LIMIT_${name}_MAX`]);

  return {
    windowMs: Number.isFinite(windowRaw) && windowRaw > 0 ? windowRaw : defaults.windowMs,
    max: Number.isFinite(maxRaw) && maxRaw >= 0 ? maxRaw : defaults.max,
  };
}

// Whether the limiters do anything at all. On by default, including in
// development, so that a limit set too low is discovered locally rather
// than in production. RATE_LIMIT_ENABLED=false exists for the e2e suite,
// which drives hundreds of requests through a handful of accounts from one
// address and is not a useful thing to rate-limit.
function rateLimitEnabled(env = process.env) {
  return env.RATE_LIMIT_ENABLED !== "false";
}


// ---------------------------------------------------------------------------
// HTTP security headers (helmet)
// ---------------------------------------------------------------------------
//
// helmet's defaults are written for a server that returns HTML to a browser.
// This one returns JSON, 302 redirects, and PDF bytes that are consumed as a
// blob - it serves no markup at all - so several defaults are both too loose
// for what this is and aimed at a threat it does not have. Each departure
// below is deliberate; the rest of helmet's defaults are kept.
//
// What was checked against the real routes before choosing these:
//
//   - GET /orders/:id/documents/:index/view streams a customer's PDF from
//     THIS origin (controllers/orderController.js). The vendor dashboard
//     fetches it with axios as a blob and renders it from a blob: URL
//     (vendor-website/src/components/DocumentViewer.jsx). That matters: a blob: URL is
//     same-origin to the page that created it, so X-Frame-Options and
//     frame-ancestors on our response never apply to it, and because the
//     fetch is a CORS request with an Authorization header rather than a
//     no-cors embed, Cross-Origin-Resource-Policy does not apply either.
//     Both can therefore stay at their strictest setting without breaking
//     document viewing.
//
//   - The Google OAuth routes are 302 redirects with no document body
//     (routes/authRoutes.js), and the flow is a top-level navigation rather
//     than a popup, so neither CSP nor Cross-Origin-Opener-Policy lands on
//     anything in that chain. Referrer-Policy: no-referrer actively helps
//     here - it stops the one-time ?code= in the callback redirect from
//     leaking through a Referer header.
//
//   - The dashboards and the admin panel are served by their own hosts, not
//     by this server, so this CSP governs none of their scripts or styles.
//     Nothing in web/ or admin/ needs a corresponding change.
function buildHelmetOptions(env = process.env) {
  const production = env.NODE_ENV === "production";

  return {
    // An API that serves no markup should declare exactly that. helmet's
    // default CSP allows script-src 'self' and inline styles, which is the
    // right shape for a server rendering pages and the wrong shape here:
    // there is no legitimate script, style, font or image this origin should
    // ever be allowed to load, so 'none' is both stricter and more honest.
    //
    // This is defence in depth rather than a live control - CSP applies to
    // documents, and a JSON response consumed by fetch is not one. It earns
    // its place for the case where something unintended does render as a
    // document, such as an HTML error page from a future dependency.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"],
        // Belt and braces with X-Frame-Options below: the modern directive
        // for browsers that honour it, the legacy header for those that
        // do not.
        "frame-ancestors": ["'none'"],
        // The one deliberate relaxation. Chrome and Edge render a PDF
        // through an internal plugin that object-src governs, so a flat
        // 'none' would stop a streamed document displaying if anyone opened
        // that endpoint directly in a tab. The product never links it that
        // way - the dashboard always goes through the blob path above - but
        // breaking a document view to tighten a directive that guards
        // markup this server does not serve would be a bad trade.
        "object-src": ["'self'"],
      },
    },
    // Stricter than helmet's SAMEORIGIN default. Nothing this API returns is
    // ever meant to be displayed in a frame, by us or by anyone.
    xFrameOptions: { action: "deny" },
    // Production only. A browser ignores Strict-Transport-Security that
    // arrives over plain http, so asserting it in development is merely
    // meaningless - but it stops being harmless the moment anyone runs local
    // TLS, because HSTS is scoped to a host and not a port, and one
    // https://localhost response would pin every other localhost dev server
    // to https for a year.
    //
    // preload is left off on purpose: submitting to the preload list is a
    // commitment that is very hard to reverse, and not one a header default
    // should make on a deployment's behalf.
    strictTransportSecurity: production
      ? { maxAge: 31536000, includeSubDomains: true, preload: false }
      : false,
    // Left at helmet's default of OFF. Turning COEP on would require every
    // cross-origin subresource to opt in via CORP or CORS, which buys
    // cross-origin isolation this API has no use for (it has no
    // SharedArrayBuffer, no high-resolution timers, no embedded content)
    // while adding a way for document streaming to break later.
    crossOriginEmbedderPolicy: false,
  };
}

module.exports = {
  isProduction,
  parseOriginList,
  resolveAllowedOrigins,
  isOriginAllowed,
  buildCorsOptions,
  buildHelmetOptions,
  resolveTrustProxy,
  rateLimitPolicy,
  rateLimitEnabled,
  DEV_ORIGIN_PATTERNS,
};
