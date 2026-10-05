# Cloudflare

Everything here is **dashboard and DNS configuration**. Only one backend
setting is involved, and no Cloudflare-specific code was added — a reverse
proxy that needs application code to work has usually been configured wrong.

No domain names appear in this document. Printlly has no domain recorded
anywhere in the repository, so every host below is written as a placeholder:

- `API_HOST` — where the Express backend is served
- `DASHBOARD_HOST` — where the vendor dashboard (`web/`) is served
- `ADMIN_HOST` — where the admin panel (`admin/`) is served

Substitute the real hostnames when they exist.

---

## 1. The one backend setting: `TRUST_PROXY`

```
TRUST_PROXY=1
```

Set this **when, and only when, Cloudflare proxies `API_HOST`** (the orange
cloud is on for that record).

This matters more than it looks, and it is wrong in both directions:

| State | What happens |
|---|---|
| Behind Cloudflare, `TRUST_PROXY` unset | Every request appears to come from a Cloudflare edge IP. All customers share **one** rate-limit bucket, and the first busy minute locks everybody out. |
| Not behind a proxy, `TRUST_PROXY=true` | Any caller can send their own `X-Forwarded-For` and Express will believe it — so an attacker resets their own rate limit at will, and the pickup-OTP limiter stops protecting anything. |

Neither failure is visible without looking for it. There is no symptom in the
logs; the limiter simply stops doing its job.

`1` means "trust exactly one hop" — Cloudflare — and take the client address
from what that one trusted hop observed. Do **not** use `true`, which trusts
the whole chain, and do not list Cloudflare's IP ranges by hand: they change,
and a stale list fails in the first direction above.

If you later add a load balancer *behind* Cloudflare, that is two hops:
`TRUST_PROXY=2`.

Verify it after deploying by checking that rate limiting still buckets per
user. `backend/scripts/securityTest.js` covers the proxy-header handling itself.

---

## 2. DNS

| Record | Proxy | Why |
|---|---|---|
| `API_HOST` | **Proxied** | TLS termination, WAF, DDoS protection, and the rate limiting in §4. |
| `DASHBOARD_HOST` | **Proxied** | Static assets benefit from the CDN. |
| `ADMIN_HOST` | **Proxied** | Same, plus §6. |

SSL/TLS mode must be **Full (strict)**. "Flexible" makes Cloudflare talk to
the origin over plain HTTP, which means the vendor's JWT and every customer
document crosses that hop in clear text — and the browser still shows a
padlock, so nobody notices.

Enable **Always Use HTTPS** and **Automatic HTTPS Rewrites**.

HSTS is already sent by the backend in production (`backend/config/security.js`:
one year, `includeSubDomains`, `preload` off). Do not also enable HSTS in
Cloudflare — two sources for one header is a way to end up with a `max-age`
nobody intended. If you turn Cloudflare's on instead, turn the backend's off.

---

## 3. What must never be cached

The backend sets no `Cache-Control` headers of its own, so **Cloudflare's
defaults decide**, and the defaults are not safe for an API. Create a cache
rule that bypasses cache entirely for:

```
/orders*        /payments*      /auth*
/admin*         /upload*        /notifications*
/support*       /saved-shops*   /shops/me*
/health*        /socket.io*
```

Caching any of those would be a security incident, not a performance bug:

- `/orders/:id/documents/:index/view` streams **a customer's PDF**. A cached
  copy served to a different vendor is a document breach.
- `/orders/*` responses contain the **pickup OTP** once an order is paid.
- `/auth/*` returns **JWTs**.
- `/admin/*` returns vendor KYC state and payout details.
- `/health*` cached means your uptime monitor watches a stale answer and
  never goes red.
- `/socket.io*` is a live transport and must not be touched at all.

Every one of those routes is authenticated, and Cloudflare does not cache a
response to a request carrying an `Authorization` header by default — but
"by default" is not a control. Make it a rule.

### What is safe to cache

Only the unauthenticated public reads, and only briefly:

| Path | Suggested TTL | Note |
|---|---|---|
| `GET /shops` (no auth) | 60s | Shop list. Includes a live busy/queue indicator, so a long TTL makes shops look wrong. |
| `GET /pricing-config` | 300s | Platform fee. Changes rarely. |

Everything served from `DASHBOARD_HOST` and `ADMIN_HOST` is static and
content-hashed by Vite, so cache those aggressively — except `index.html`,
which must **not** be cached, or a deploy will not reach anyone who has
visited before.

---

## 4. Rate limiting at the edge

Cloudflare's rate limiting is a **complement to**, not a replacement for, the
application's own (`backend/middleware/rateLimit.js`). They protect different things:

- **Cloudflare** stops traffic before it costs you anything. It can only key
  on IP, which is exactly why it cannot replace the application's limiter —
  customers are on carrier NAT, where thousands of handsets share one address.
- **The application** keys on authenticated user id, which is the only way to
  limit a person rather than a mobile operator.

Suggested edge rules, sized well above anything a real client does:

| Path | Limit | Reason |
|---|---|---|
| `/auth/*` | 30 / min / IP | Credential stuffing arrives from few addresses at high volume. |
| `/upload*` | 60 / min / IP | Each upload costs a Cloudinary round trip and a PDF parse. |
| `/*` | 600 / min / IP | Blanket backstop. |

**Do not rate-limit these:**

- `/payments/webhook` — every payment confirmation for every customer arrives
  from Razorpay's own small set of addresses, plus retries. An IP-keyed limit
  would throttle real confirmations on a busy evening, and a dropped
  confirmation means a customer charged for an order that never becomes paid.
  The application already meters this path generously and keyed separately.
- `/health`, `/health/ready` — a monitor polls from one address forever. A 429
  is not a 200, so the monitor would report a healthy server as down.

---

## 5. WAF, bots and DDoS

- **Managed Ruleset**: on. Start in *Log* mode for a few days and review
  before switching to *Block* — `/upload` posts multipart PDFs, which generic
  rulesets sometimes dislike.
- **DDoS protection**: on (it is on by default and cannot be disabled).
- **Bot Fight Mode**: on for `DASHBOARD_HOST` and `ADMIN_HOST`.
  **Be careful on `API_HOST`**: the Printlly mobile app is not a browser, has
  no cookies and runs no JavaScript, so a challenge-based bot rule will see it
  as a bot and break the app for every customer. If you enable bot management
  on the API, exclude `/payments/webhook` (Razorpay is a server, not a
  browser) and verify the mobile app end to end afterwards.
- **Browser Integrity Check**: leave **off** on `API_HOST`, for the same
  reason.

---

## 6. Admin panel access

`ADMIN_HOST` serves a panel that can approve vendors, read support
conversations and record settlements. It needs no public reachability at all.

Put **Cloudflare Access** in front of it, restricted to your team's email
domain or a named list. That is a second, independent factor in front of the
admin JWT, and it costs nothing on the free tier for a small team.

If Access is not an option, a WAF rule restricting `ADMIN_HOST` to known
office or VPN IP ranges achieves most of it.

---

## 7. What Cloudflare does *not* solve

Worth stating plainly, so these are not assumed to be covered:

- It does not protect the origin if the origin is reachable directly by IP.
  Use Cloudflare Tunnel, or firewall the origin to Cloudflare's IP ranges —
  otherwise an attacker who finds the origin address bypasses all of the
  above.
- It does not encrypt anything at rest.
- It is not a backup.
- It does not stop an authenticated user abusing their own access. That is
  what the application's authorisation checks are for.

---

## Verifying the setup

```bash
# TLS and HSTS (production only)
curl -sI https://API_HOST/health | grep -i strict-transport-security

# Health must NOT be cached
curl -sI https://API_HOST/health | grep -i cf-cache-status   # expect BYPASS or DYNAMIC

# An authenticated route must never be cached
curl -sI -H "Authorization: Bearer <token>" https://API_HOST/notifications | grep -i cf-cache-status

# Rate limiting must still bucket per user, not per edge IP:
# two different users' tokens from the same IP must have independent budgets.
```

If `cf-cache-status: HIT` ever appears on an authenticated route, stop and fix
the cache rule before going further.
