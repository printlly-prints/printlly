# Printlly

Upload a document, pay online, collect the printout from a nearby print shop.

Printlly connects customers who need something printed with local print shops.
A customer uploads PDFs from the mobile app, picks a shop, pays, and collects
with a one-time pickup code. The shop sees the job on a web dashboard, prints
it, and marks it ready. Uploaded files are deleted automatically once the order
ends.

---

## Repository layout

Four applications, one repository.

```
printlly/
├── backend/           Node + Express API, MongoDB, Socket.io
├── userapp/           Customer mobile app (React Native / Expo)
├── vendor-website/    Print partner dashboard + public site (React / Vite)
├── admin-panel/       Internal admin panel (React / Vite)
├── docs/              Operations docs - Cloudflare, Atlas, uptime, observability
├── assets/            Brand and reference imagery
└── design/            Design mockups (static HTML)
```

Each of the four applications has its own `package.json`, its own
`node_modules`, and its own `.env`. They are deployed separately and share
nothing at runtime but the API.

`vendor-website` serves two things from one build: the public marketing site
and the legal pages at `/terms`, `/privacy` and so on, plus the authenticated
print-partner dashboard.

---

## Getting started

Each application is installed and run independently.

```bash
# API - http://localhost:5000
cd backend && npm install && npm run dev

# Print partner dashboard + public site - http://localhost:5173
cd vendor-website && npm install && npm run dev

# Admin panel
cd admin-panel && npm install && npm run dev

# Customer app
cd userapp && npm install && npx expo start
```

Every application needs a `.env`. Copy the template next to it and fill it in:

```bash
cp backend/.env.example        backend/.env
cp vendor-website/.env.example vendor-website/.env
cp admin-panel/.env.example    admin-panel/.env
cp userapp/.env.example        userapp/.env
```

`backend/.env.example` is the detailed one. It documents every variable, why it
exists, and what happens when it is missing — including which services are
optional and which refuse to start without configuration.

### Minimum to run the API

`MONGODB_URI`, `JWT_SECRET`, and the three `CLOUDINARY_*` values. Everything
else is optional and the server will tell you at startup what is inactive.

---

## Configuration, and what is required

Required:

| | |
|---|---|
| **MongoDB** | The source of truth for every durable fact: users, orders, payments, documents, settlements. |
| **Cloudinary** | Where customer PDFs are stored until the order ends. |
| **JWT secret** | Signs session tokens. |

Optional, and off when unconfigured:

| | |
|---|---|
| **Razorpay** | Payments. Without it the payment routes answer 501. |
| **Sentry** | Error reporting. |
| **Brevo** | Transactional email. |
| **Microsoft Teams** | Critical alerting (P0/P1). |
| **PostHog** | Product analytics. |
| **Upstash Redis** | Shared rate-limit counters and locks. Without it, limits are per process. |
| **Expo push** | Push notifications. |

Every optional integration behaves identically whether it is unconfigured or
the provider is down, which is deliberate: it means the outage path is the one
exercised in development every day. See
[docs/OBSERVABILITY.md](docs/OBSERVABILITY.md).

Two things *do* refuse to start, both on purpose: a production deployment with
no CORS allowlist, and a production deployment with Razorpay configured but no
webhook secret. Running without either is worse than not running.

---

## Tests

All suites live in `backend/scripts` and run against a real database and a real
server — there are no mocks of our own code.

```bash
cd backend

node scripts/e2eTest.js              # 21 end-to-end sections (needs the server running)
node scripts/authSecurityTest.js     # authentication, sessions, revocation
node scripts/securityTest.js         # CORS, headers, rate limiting, proxy handling
node scripts/documentCleanupTest.js  # document deletion, retries, orphan sweep
node scripts/paymentWebhookTest.js   # Razorpay webhook signature + idempotency
node scripts/orderEventsTest.js      # order events, sockets, push fan-out
node scripts/observabilityTest.js    # scrubbing, alerting, email, Redis, health
```

Set `BREVO_ENABLED=false` when running the suites against a deployment that has
real Brevo credentials, or the test orders will send live email to throwaway
addresses.

---

## Health endpoints

```
GET /health        liveness  - touches nothing; this is what an uptime monitor watches
GET /health/ready  readiness - pings MongoDB and checks required configuration
```

Both are unauthenticated, so neither response reveals a hostname, a dependency
name or an error. See [docs/UPTIMEROBOT.md](docs/UPTIMEROBOT.md).

---

## Documentation

| | |
|---|---|
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Which tool answers which question, the alert severity ladder, failure behaviour per provider, and a runbook |
| [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) | Edge configuration, `TRUST_PROXY`, and which paths must never be cached |
| [docs/MONGODB_ATLAS.md](docs/MONGODB_ATLAS.md) | Database alerts, an index review against the real queries, backups |
| [docs/UPTIMEROBOT.md](docs/UPTIMEROBOT.md) | External monitoring setup |
| [vendor-website/src/styles/tokens.md](vendor-website/src/styles/tokens.md) | Design tokens for the web surfaces |

---

## A note on secrets

`backend/.env` holds live credentials: the MongoDB connection string, the
Razorpay key and webhook secrets, the Cloudinary API secret, the JWT signing
secret and the Brevo API key. It is gitignored at every depth, and so are
`.env.production`, `.env.local` and the other variants.

Nothing with a `VITE_` or `EXPO_PUBLIC_` prefix is a secret. Vite and Expo
**inline** those values into the JavaScript they ship, so anything given one of
those prefixes is published to everyone who loads the page or installs the app.
The only credentials that legitimately carry those prefixes are a Sentry DSN
and a PostHog project key, both of which are write-only by design.
