# UptimeRobot

External availability monitoring. No code or configuration is needed in
Printlly — the two endpoints already exist. This is the setup to perform in
the UptimeRobot dashboard.

`API_HOST` below is a placeholder: no domain is recorded anywhere in this
repository. Substitute the real backend hostname.

---

## The two endpoints

| Endpoint | Question it answers | Touches |
|---|---|---|
| `GET /health` | Is the process alive and serving HTTP? | Nothing |
| `GET /health/ready` | Can it actually do its job right now? | MongoDB ping + required config |

Both are unauthenticated, because a monitoring service has no credentials and
could not safely be given any — a token pasted into a third-party dashboard
has left your control. Both response bodies are therefore treated as public
and contain nothing but a status. See `backend/controllers/healthController.js`.

Responses:

```
200  {"status":"ok"}
200  {"status":"ok","degraded":["cache"]}     # serving, Redis unreachable
503  {"status":"not_ready"}
```

No hostnames, no driver errors, no versions, no stack traces, and the 503
does not say *which* dependency failed. An attacker learning "the database is
down" from a 503 is unavoidable and harmless; learning your cluster hostname
from a driver error message is neither. The detail an operator needs goes to
the application log and to Sentry, both already authenticated.

---

## Monitors to create

### 1. Liveness — this is the one that should page

```
Type:            HTTP(s)
URL:             https://API_HOST/health
Interval:        5 minutes   (1 minute on a paid plan)
Keyword:         ok          (Keyword type: exists)
Alert after:     2 consecutive failures
```

**This is your "Printlly is down" alert.** It touches nothing, so it goes red
only when the server is genuinely unreachable.

"Alert after 2 failures" is deliberate: a single missed probe is usually the
network between UptimeRobot and you, and a monitor that pages on one blip
gets muted.

### 2. Readiness — this one should warn, not page

```
Type:            HTTP(s)
URL:             https://API_HOST/health/ready
Interval:        5 minutes
Keyword:         ok          (Keyword type: exists)
Alert after:     2 consecutive failures
```

Keyword matching rather than status code matters here: a `degraded` response
still returns **200** and still contains `ok`, so the monitor stays green
while Redis is unreachable — which is correct, because the server is serving.
A `not_ready` 503 contains neither, so it goes red.

### 3. Vendor dashboard and admin panel (optional)

```
URL:             https://DASHBOARD_HOST/
Interval:        5 minutes
```

Static hosting, so this mostly watches your CDN. Worth having; not worth
paging for.

---

## Why these are two separate monitors

Conflating them is a common and expensive mistake.

A single endpoint that checks the database will report **the server** as down
during a database blip, so the alert says "Printlly is offline" when the truth
is "MongoDB is unreachable" — and the first ten minutes of the incident are
spent looking at the wrong system.

Worse, a platform that restarts containers on a failed *liveness* check will
cycle every instance during a database outage, turning a recoverable
dependency failure into a total one. If your host supports both probe types,
point liveness at `/health` and readiness at `/health/ready`, never the
reverse.

---

## What to do about alerts

Printlly already alerts on its own dependencies through Microsoft Teams
(`backend/utils/alerts.js`), including MongoDB disconnection at P0. UptimeRobot
answers the one question the application cannot answer about itself: **is it
reachable at all?** A crashed process, an exhausted host, a DNS failure or a
misrouted load balancer all produce silence from the application and a red
monitor here.

So route UptimeRobot's own notifications to the **same Teams channel** as the
P0 alerts, and treat them as the outer ring:

- UptimeRobot red, no Teams alerts → the process or the network is gone.
  Nothing inside the application got the chance to say anything.
- Teams P0 (MongoDB disconnected), UptimeRobot green → the server is up and
  correctly reporting itself unable to serve.
- Both → a full outage.

---

## Free-plan limits worth knowing

- **5-minute minimum interval.** Up to five minutes of downtime can pass
  unnoticed. For a product where a customer is standing at a counter, that is
  usually acceptable; if it is not, the paid plan's 1-minute interval is the
  fix, not a second monitoring service.
- **50 monitors**, far more than this needs.
- Keyword monitoring is included on the free plan.
- No SMS on the free plan — email and webhook only, which is why the Teams
  webhook integration is the useful path.

---

## Do not point a monitor at `/`

`GET /` returns `{"message":"Print marketplace API is running"}` and exists
for historical reasons. It works, but `/health` is the endpoint with a
documented contract and a stable body, and it is the one that will keep
behaving this way.
