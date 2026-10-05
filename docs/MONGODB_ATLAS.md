# MongoDB Atlas

MongoDB is the only dependency whose loss means Printlly can do nothing at
all — no order, no login, no document record. It is therefore the one
integration treated as a hard dependency of readiness, and the only one
alerted on at **P0**.

Two parts: what the application already does, and what has to be configured
in the Atlas dashboard.

No cluster name, connection string, region or credential appears in this
document. `MONGODB_URI` is the only place the application learns any of them,
and it is server-only.

---

## 1. What the application already does

Already implemented, no Atlas configuration required:

- **Connection monitoring** (`backend/config/db.js`). Mongoose's own `disconnected`,
  `reconnected` and `error` events are attached, so a lost connection pages at
  P0 within seconds rather than being inferred from a support ticket. Events
  are ignored until the first successful connection, so a slow DNS lookup at
  startup does not fire a false P0.
- **Fail-fast startup.** A server that cannot reach MongoDB exits rather than
  serving requests it cannot fulfil, so the platform's restart policy backs it
  off. The P0 alert is sent *and awaited* (with a 5-second cap) before the
  process ends, because an unflushed alert would be lost.
- **A real readiness probe** (`GET /health/ready`). It issues an actual
  `admin().ping()`, not a `readyState` check: Mongoose reports `connected`
  based on its own view of the socket, which can lag reality — a cluster
  failover or a silently dropped connection leaves `readyState` at 1 while
  every query hangs.
- **TTL-based retention**, so three collections need no cleanup job:
  `sessions` (expires at the JWT's own expiry), `webhookevents` (90 days),
  `emaildeliveries` (90 days).

---

## 2. Atlas alerts to configure

Atlas > Project > Alerts. Route them to the **same destination as the P0
Teams alerts** so one incident does not arrive in two places nobody watches.

| Alert | Threshold | Why this number |
|---|---|---|
| **Host down** | immediate | The application's own P0 covers the client's view; this covers the case where the whole process is gone and cannot report anything. |
| **Disk space used** | > 80% | A full disk makes the cluster read-only, which fails every write — orders, payments, documents. Recoverable with warning, an outage without. |
| **Connections** | > 80% of limit | The free and shared tiers cap connections at 500. Mongoose pools per process, so this is the limit a horizontal scale-up hits first, and the symptom is random query failures rather than anything obviously connection-shaped. |
| **Replication lag** | > 10s | Reads from a lagging secondary would show a customer an order state that has already changed. |
| **Query targeting: scanned / returned** | > 1000 | The single most useful index alert. It fires when a query reads a thousand documents to return one, which is what a missing index looks like before it becomes a latency problem. See §3. |
| **System CPU (normalized)** | > 75% for 10 min | Sustained, not spiky. A backup or an index build will spike it. |
| **Opcounters: query** | unusual rise | Catches a scraping loop or a runaway client. |

Enable the **Performance Advisor** (Atlas > Clusters > Performance Advisor).
It recommends indexes from real observed queries, which is strictly better
than guessing — including better than the recommendations in §3, once there
is enough production traffic to learn from.

---

## 3. Index review

Reviewed against the queries actually in this codebase, not against a generic
checklist. **None of the changes below have been applied** — index changes on
a live cluster are a deliberate, timed operation for whoever owns it, and at
current data volumes (single-digit orders) every one of them is a no-op in
practice. They matter at scale, and this is the record of what to do then.

### 3a. Missing: the abandoned-order cron does a full collection scan

This is the only finding that will definitely bite.

`backend/cron/cleanupAbandonedOrders.js` runs every 15 minutes and issues:

```js
Order.find({ status: { $in: ["pending", "accepted"] }, updatedAt: { $lt: cutoff } })
Order.find({ payment_status: "created", status: "pending", createdAt: { $lt: cutoff } })
```

There is **no index on `updatedAt` or `createdAt`** in the `orders`
collection. The first query therefore scans every order in the database, 96
times a day, forever — and it grows linearly with the collection. It is
invisible today and will become the most expensive recurring operation in the
system.

```js
db.orders.createIndex({ status: 1, updatedAt: 1 })
db.orders.createIndex({ payment_status: 1, status: 1, createdAt: 1 })
```

The second of those also makes the standalone `{payment_status: 1}` index
redundant (see 3c).

### 3b. Suboptimal: customer order history sorts in memory

`GET /orders/customer` runs:

```js
Order.find({ customer_id }).sort({ createdAt: -1 }).skip(skip).limit(limit)
```

The existing `{customer_id: 1}` index serves the filter but not the sort, so
MongoDB fetches every one of that customer's orders and sorts them in memory
before discarding all but one page.

```js
db.orders.createIndex({ customer_id: 1, createdAt: -1 })   // replaces { customer_id: 1 }
```

With this, filter, sort and pagination are all served from the index.

### 3c. Redundant indexes

Each of these is a **prefix** of an existing compound index, so it can never
be chosen over it. Every index costs write throughput and memory, so these are
pure overhead:

| Collection | Redundant index | Covered by |
|---|---|---|
| `devicetokens` | `{user_id: 1}` | `{user_id: 1, active: 1}` |
| `settlements` | `{shop_id: 1}` | `{shop_id: 1, settled_at: -1}` |
| `payouthistories` | `{shop_id: 1}` | `{shop_id: 1, changed_at: -1}` |

And these are on fields with two or three possible values, so they are almost
never selective enough for the planner to prefer them:

| Collection | Low-value index | Note |
|---|---|---|
| `devicetokens` | `{active: 1}` | Boolean. Already covered by the compound above for every real query. |
| `orders` | `{payment_status: 1}` | Three values. Becomes strictly redundant once 3a's compound exists. |
| `orders` | `{settlement_status: 1}` | Two or three values. Every real settlement query also filters by `shop_id`, which the existing compound covers. |

Dropping an index is reversible but not free (rebuilding takes time), so
confirm against Atlas's **Performance Advisor > Drop Index Suggestions**,
which observes real usage, before removing any of them.

### 3d. Indexes that are correct and load-bearing — do not touch

Worth naming explicitly, because several look unusual and all of them are
deliberate:

- `notifications {order_id, type}` **unique, partial** — this is what makes
  notification delivery idempotent. A duplicate-key error is the *success*
  case meaning "already recorded", and it is what stops a redelivered webhook
  buzzing a customer's phone twice. Partial because the `shop_*` notification
  family has no `order_id`.
- `emaildeliveries {next_attempt_at}` **partial on `status: "retrying"`** —
  keeps the retry index down to the handful of rows in flight rather than
  every email ever sent.
- `sessions {expires_at}`, `webhookevents {expires_at}`,
  `emaildeliveries {expires_at}` **TTL = 0** — expire *at* the stored date.
  These replace three cleanup jobs.
- `shops {location}` **2dsphere** — required for the nearby-shop search.
- `users {phone}`, `users {google_id}` **unique, sparse** — sparse is
  essential: without it, every Google account with no phone would collide on
  `null`.
- `uploads {used, createdAt}` — serves the orphan-upload sweep, which is a
  document-privacy control.

---

## 4. Access and credentials

- **Database user**: one per application, with `readWrite` on the one database
  only. Not `atlasAdmin`, and not a user shared with a migration tool.
- **IP access list**: the deployment's egress addresses, not `0.0.0.0/0`.
  If the host has no stable egress IP, use **Atlas Private Endpoint** or
  Atlas's own VPC peering rather than opening it to the internet — a
  connection string is one leaked environment variable away from being usable
  by anyone if the access list is open.
- **Rotate `MONGODB_URI` if it has ever been pasted anywhere** — a ticket, a
  chat message, a screenshot. It contains its own password.
- `backend/utils/scrub.js` redacts anything matching `mongodb://` or `mongodb+srv://`
  from every outbound error report, so a connection string cannot reach Sentry
  inside an error message. That is a backstop, not a substitute for the above.

---

## 5. Backups

- **Enable continuous backup / point-in-time recovery.** The free tier (M0)
  has *no backups at all*, which is worth knowing before it matters: there is
  nothing to restore from.
- **Test a restore once**, into a separate cluster, before you need one. An
  untested backup is a belief, not a backup.
- Retention long enough to outlast the window in which a problem would be
  noticed — a corrupted settlement or a bad migration is often found days
  later, not hours.

---

## 6. What is deliberately *not* in MongoDB

Recorded so the boundary stays where it is: rate-limit counters, alert
suppression markers, caches and distributed locks live in Redis
(`backend/utils/redis.js`), because losing any of them is survivable.

The test is: **if losing the value could change what a customer is charged,
who owns a document, or whether an order is paid, it belongs in MongoDB.**
Nothing authoritative is ever written to Redis, which is what keeps a Redis
outage from being a data-integrity incident.
