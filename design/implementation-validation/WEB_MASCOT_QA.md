# Website mascot recovery validation — 17 October 2026

## Source and implementation

The root agent inspected the live Figma mascot component set `347:547`, handoff `353:5282`, desktop outage `351:30061`, and the three dark mobile website fallbacks. This implementation uses the supplied individual PNGs and `screen-mapping.json`; the overview sheet is never an application image. The illustrations remain static in all motion preferences.

The 12 mapped website variants are implemented by the shared `MascotRecovery` and `RecoveryPage`: offline, service unavailable and route not found, at 1440/390px in Light/Dark. Desktop artwork is 144px and mobile artwork is 96px, with alpha and aspect ratio preserved. The text and recovery actions remain adjacent to the artwork. Mobile actions stack at full width. Existing website top navigation and accessible mobile menu are retained, rather than replacing them with the simpler handoff header. Runtime shared theme tokens are retained; these can differ from the older Figma dark palette.

Public routes `/offline` and `/service-unavailable` retry an actual GET `/shops` and return home only when that request succeeds. Unknown website routes show the not-found screen instead of silently redirecting home. API404 errors retain their affected-resource context; in particular, GET `/shops/me`404 still means the partner has not registered a shop.

The same reusable recovery presentation is integrated into partner shop loading, order reads, dashboard order analytics, earnings/settlement reads, pricing reads and the document viewer. Successful prior order data remains in memory and is explicitly labelled as last loaded when a refresh fails. Field validation and mutation errors remain inline. Server410 document access returns to the existing order, while authenticated401 session expiry routes through the existing partner login. No password-reset or other new backend endpoint was added.

The authenticated401 event compares the outgoing token with the current token, and shop reads have a generation/session fence, so a late response from an older session cannot expire or overwrite a newer session. Login401 remains a form-level credential failure.

## Checks

- `npm test`: 11/11 passed, including recovery classification and Retry-After handling.
- `npm run build`: passed, 473 modules transformed.
- `node design/qa-mascot-web.cjs`: passed, using disposable Chrome contexts and synthetic intercepted API failures, without accessing production accounts.
- 12 captured layouts: `web-mascot-{offline,service_unavailable,not_found}-{light,dark}-{1440,390}.png` in this directory. Verified decoded, nonempty individual image, rendered 144px/96px dimensions, no horizontal overflow and no runtime page errors in every case.
- Actual browser recovery behavior: failed GET503 remains on the recovery page; successful GET200 returns home. GET `/shops/me`404 goes to registration;503 remains on dashboard recovery;401 shows session-ended recovery, and Sign in again clears the old session and opens the existing login.
- Visually inspected desktop Light outage and mobile Dark outage against the live-Figma observations: compact left-side art, adjacent title/body, primary/outlined actions and responsive stack match. Source copy matches the inspected handoff.

## Limits and remaining scope

The source website is partner/public, while customer uploads, UPI and order payment recovery run in the Expo application. This change does not add a duplicate web customer checkout. Partner/admin exhaustive error-screen rollout is not represented by the supplied mapping; the admin app is unchanged. Service/connection read retries do not retry mutations or payments. The build and browser checks use synthetic responses; no production outage, live payment or production database was exercised.

## GET throttling follow-up

`createReadCooldown` now gates actual GET requests after a server429 carrying a valid Retry-After seconds or HTTP-date header. The memory-only cache is bounded to64 entries, scoped by authorization and the full Axios URI including query parameters, and purges expired entries. Cached rejection retains only status/header metadata, never the original response payload. Polling and manual refresh cannot bypass the deadline. Mutations, payment requests and requests for another account/URL are unaffected; nothing automatically retries a request.

`npm test` now passes13/13 tests, including cooldown expiry, account and URL isolation, HTTP dates, invalid headers, the entry bound and exclusion of mutations. The final Vite build passes with474 modules. `node design/qa-web-cooldown.cjs` verified the actual browser Axios interceptors: three attempts produced one network GET during the delay; another GET succeeded after expiry. No visual change required another screenshot matrix.

Cross-origin deployment requirement: the API must expose Retry-After through `Access-Control-Expose-Headers` for browser JavaScript to read it. The test fixture exposes it explicitly. A header hidden by CORS cannot provide a frontend deadline; this implementation does not invent one. No backend configuration was changed in this task.
