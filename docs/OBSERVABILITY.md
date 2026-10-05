# Observability

How Printlly is watched, and which tool answers which question. One tool per
question, kept strictly apart — a channel that carries two kinds of signal
gets read for neither.

```
                        the application
                               |
   +---------------+-----------+-----------+---------------+
   |               |                       |               |
 Sentry          Teams                  PostHog          Brevo
 technical     a human must act        how the product    what the
 errors        NOW                     is used           customer is told
   |               |                       |               |
   "what broke"  "wake someone"        "measure it"      "tell them"


   MongoDB Atlas  ->  the source of truth, and its own monitoring
   Upstash Redis  ->  shared ephemeral state only, never authoritative
   Cloudflare     ->  the edge: TLS, WAF, DDoS, caching
   UptimeRobot    ->  is it reachable at all (the outer ring)
   Razorpay       ->  payments
```

The division is enforced in code, not by convention:

| Tool | Answers | Never carries |
|---|---|---|
| **Sentry** | What broke, where, with a stack trace | Product events, business metrics |
| **Teams** | Something needs a human **now** | Ordinary application errors |
| **PostHog** | How the product is used | Errors, anything identifying |
| **Brevo** | Transactional email to users | Operational alerts |
| **UptimeRobot** | Is it reachable from outside | Anything the app could tell you itself |

Nothing in the application reads from Sentry, Teams or PostHog. All three are
write-only, and removing any of them would change no behaviour.

---

## The governing rule

**Every integration is optional and OFF when unconfigured.**

That is a requirement, not a convenience. Printlly must keep taking orders
when Sentry, Brevo, Teams, PostHog or Redis is unavailable — so a deployment
that has not configured one behaves *exactly* as if that provider were down.
Both run the same code path, which means the outage path is exercised by every
developer every day rather than discovered during the first real outage.

A setting that is present but **malformed** does stop the boot
(`backend/config/observability.js`), because a half-configured integration is a bug,
and a bug found at startup costs a deploy while the same bug found during an
incident costs the incident.

The two exceptions, which *do* refuse to start, are both older and both
deliberate: a missing production CORS allowlist (`backend/config/security.js`) and a
missing production Razorpay webhook secret (`backend/config/razorpay.js`). Those are
security and money controls — running without them is worse than not running.
Error reporting is not in that category: refusing to boot because Sentry is
unconfigured would convert a monitoring gap into an outage.

---

## Failure behaviour, per provider

| Provider down | What happens to Printlly |
|---|---|
| **Sentry** | Nothing. Every helper is a no-op; errors still reach the application log. |
| **Brevo** | Orders, payments and in-app notifications are unaffected. The email is recorded as `retrying` or `failed`, retried with backoff by `backend/cron/retryEmails.js`, and reported to Sentry. A run of failures raises one P1. |
| **Teams** | The alert is logged locally first, always, before any delivery is attempted — so the evidence exists even with every outbound channel down. Sentry still receives it. |
| **PostHog** | Nothing. Events are buffered in memory and dropped on failure. |
| **Redis** | Rate limiting degrades to per-process counters — the same behaviour as a deployment with no Redis. Alert dedupe falls back to a per-process map, erring towards *sending*. Locks fail towards running the work anyway, so an outage cannot halt the cron jobs. **Not** a hard dependency of readiness. |
| **Cloudinary** | The document operation fails safely and is picked up by the existing retry/cleanup system. Sentry gets the first failures; a stuck document raises P1 after several attempts, because that is a privacy commitment being missed. |
| **Razorpay** | Payment cannot complete, but order integrity is preserved — the order simply stays unpaid. The webhook is the server-authoritative path and retries on a 500. |
| **MongoDB** | `/health/ready` returns 503 and a P0 fires. This is the one dependency whose loss stops everything, and the only one treated that way. |

---

## Severity ladder

```
P0  Teams + Sentry   Printlly is broken or losing money. Page now.
P1  Teams + Sentry   Degraded. Someone should look today.
P2  Sentry only      A real, handled error. Worth a trend, not a ping.
P3  Logs + Sentry    Notable but expected.
```

`ALERT_MIN_SEVERITY` (default `P1`) is the quietest severity that reaches
Teams. It exists because **alert fatigue is a failure mode, not a nuisance**: a
channel that fires on every ordinary 500 is muted within a week, and the P0
that follows is seen the next morning.

### What is P0

- MongoDB disconnected, or unreachable at startup
- Razorpay webhook processing failed after a valid signature
- Razorpay reported an amount or currency that does not match the order
- Authentication failing for everyone (the session lookup threw)
- An uncaught exception

### What is P1

- A signature-verified payment for a `razorpay_order_id` with no matching order
- Document cleanup failing (a privacy commitment being missed)
- Cloudinary uploads failing
- Transactional email not being delivered at all
- An elevated 5xx rate (a burst, not one error)
- An unhandled promise rejection

### What is deliberately NOT alerted

**An invalid webhook signature.** `/payments/webhook` is publicly reachable,
so a bad signature is something any stranger can produce at will. Wiring it to
an alert channel would hand them a way to flood the on-call channel, or burn a
Sentry quota, from a single curl loop — making the monitoring layer itself the
attack surface. A rejected request that changed nothing is not an incident. It
is still written to the application log, which is where a genuine pattern (a
secret rotated without updating the deployment) shows up as a run of
rejections.

---

## What never leaves the process

Enforced at a single chokepoint, `backend/utils/scrub.js`, rather than trusted to each
call site — three separate denylists would drift, and the first to drift would
be the one that leaked.

Never transmitted to any third party: passwords and hashes, JWTs and session
ids, pickup OTPs, document URLs and Cloudinary public ids, payment signatures
and credentials, KYC and bank details, email addresses and phone numbers,
customer location, and stack-frame local variables.

Three design decisions worth knowing:

- **Request headers are an allowlist**, not a denylist. A header added by a
  future CDN is dropped by default rather than forwarded.
- **PostHog properties are an allowlist.** Unlike an error — whose value is in
  its unexpected detail, so its filter must be a denylist — every analytics
  property is intentional. A new field on an order cannot start flowing to
  PostHog because someone passed an extra object.
- **Session replay and autocapture are off in every client, in code.** The
  vendor dashboard renders customer documents; the admin panel renders vendor
  KYC files; the mobile app shows pickup codes. A DOM or screen recording of
  any of them would be a recording of other people's documents. Autocapture
  sends the text of whatever was clicked, which on those screens is a
  filename — and a filename is frequently the sensitive part before anyone
  opens the file.

---

## Runbook

### "Printlly is down"

1. `GET /health` — if it answers, the process is alive and this is not a total
   outage.
2. `GET /health/ready` — a 503 means a dependency or configuration problem.
3. Teams: a P0 will usually already name it.
4. No Teams alert and UptimeRobot red → the process or the network is gone
   before anything inside the application got a chance to speak.

### "A customer was charged but the order is unpaid"

1. Find the payment in the Razorpay dashboard; note `razorpay_order_id`.
2. `db.webhookevents.find({ razorpay_order_id: "..." })` — the `result` field
   says exactly what the webhook decided: `processed`, `already_paid`,
   `amount_mismatch`, `order_not_found`, `not_payable`, or still `processing`.
3. `amount_mismatch` → a P0 fired and the order was deliberately left unpaid.
   Reconcile by hand; never edit `total_amount` to match the webhook.
4. Still `processing` after a few minutes → the handler died mid-flight. A
   Razorpay retry takes the claim over after two minutes; if Razorpay has
   stopped retrying, the event was lost and the payment needs manual
   reconciliation.

### "A customer says they got no email"

1. `db.emaildeliveries.find({ user_id: ... }).sort({ claimed_at: -1 })`.
2. `skipped` → Brevo was not configured in that deployment.
3. `failed` with a permanent error → usually a bad address; `last_error` says.
4. `retrying` → `backend/cron/retryEmails.js` will try again; check `next_attempt_at`.
5. Nothing at all → the event never fired. Check whether the in-app
   notification exists; if it does and the email record does not, the bug is
   in the email dispatch, not the event.

### "Rate limits are behaving oddly after a scale-up"

With no Redis, limits are **per process**, so a limit of 20 across four
instances is effectively 80 — and the effective limit changes silently
whenever the deployment scales. Configure Upstash
(`UPSTASH_REDIS_REST_URL` + `_TOKEN`) to make the configured number mean what
it says. Startup logs state which mode is active.

---

## Verifying it works

```bash
node backend/scripts/observabilityTest.js     # 203 assertions, contacts nothing external
```

It drives every provider into failure — timeout, 500, malformed response,
thrown exception — and asserts that the call returns rather than throws, that
the business operation is untouched, and that nothing sensitive appears in any
outbound payload. No real DSN, key or webhook URL is required or used.

Startup logs state the live posture in three lines:

```
[observability] service: ... | environment: ... | release: ...
[observability] sentry: ... | traces: ... | brevo email: ... | posthog: ...
[observability] teams alerts: ... | redis: ... (per-process rate limiting)
```

Names and states only — never a DSN, key, token or webhook URL. A startup log
is one of the most frequently pasted artefacts in a support thread, so it is
treated as public.

---

## Related

- `docs/CLOUDFLARE.md` — edge configuration, and what must never be cached
- `docs/UPTIMEROBOT.md` — external monitoring setup
- `docs/MONGODB_ATLAS.md` — database alerts, index review, backups
- `backend/.env.example` — every variable, with PUBLIC/PRIVATE clearly separated
