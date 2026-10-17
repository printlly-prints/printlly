# Queue dashboard QA — 17 October 2026

`node design/qa-queue-web.cjs` passed against loopback vendor/admin Vite apps and the disposable `design/qa-partner-api.cjs` fixture. A separate headless Chrome context was used; no production data or user browser session was accessed.

- Vendor Overview: Light/Dark at 1440 and 390 pixels; queue counts, observed rush and clearance rendered; no horizontal overflow or runtime errors.
- Closed shop: queue remains visible for operational work, rush and clearance disappear. Header availability also uses the refreshed server availability.
- Admin settings: count fallback labels/explanation rendered at 1440 and 390 pixels without horizontal overflow.
- Screenshots: `web-queue-{light,dark}-{1440,390}.png`, `web-queue-closed-dark-390.png`, `admin-queue-fallback-{1440,390}.png`. Light desktop, Dark narrow and admin narrow were visually inspected.

Fixture estimates use the production `calculateQueuePressure` and `workloadUnits` functions with synthetic paid orders and timestamped preparation history. They are not live throughput measurements. The production dashboard reads the existing authenticated `GET /shops/me` queue snapshot, refreshing on order events/actions, visible polling and explicit refresh. No endpoint or manual rush override was invented.

The UI intentionally distinguishes work awaiting preparation from orders already ready for pickup. Clearance describes existing queued work, not the pickup time of a newly submitted order. Insufficient history uses the platform's queued-order count thresholds; the website never recalculates rush itself.
