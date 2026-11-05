# Website implementation and QA — 15 October 2026

The React/Vite website is implemented against the active local Figma extraction, with the user's later corrections applied: website navigation stays at the top, menus are concise, and the partner overview leads with business metrics. The latest production build and all nine Node tests pass. This report distinguishes completed checks from the final browser limitation.

## Environment and scope

- Website preview: `http://127.0.0.1:5174`, started with `VITE_API_BASE_URL=http://127.0.0.1:5180`.
- API: `design/qa-partner-api.cjs`, bound only to `127.0.0.1:5180`, disposable memory, synthetic account/orders/transfer history. No database, gateway, production credentials, real customers, or real payment actions.
- Browser: Brave via the supported computer-use browser runtime. Earlier public-flow checks used the in-app browser.
- No backend source or API contract changes. Existing unrelated backend/admin lockfile changes were preserved.

## Final rendered partner matrix

All **42 combinations** passed: seven routes × three viewport sizes × Light/Dark. Each check observed the actual rendered route, page scroll position, document width, image loading, and absence of native-style bottom navigation.

| Routes | Viewports | Modes | Result |
| --- | --- | --- | --- |
| `/dashboard`, `/orders`, `/pricing`, `/availability`, `/earnings`, `/shop-profile`, `/settings` | 1440×900, 390×844, 320×844 | Light, Dark | 42/42: no page horizontal overflow, no broken images, no bottom navigation, scroll starts at zero |

Raw observations: [web-final-layout.json](web-final-layout.json). Representative **viewport** screenshots:

- [Overview, desktop dark](web-final-overview-dark-1440.png)
- [Overview, desktop light](web-final-overview-light-1440.png)
- [Overview, phone light](web-final-overview-light-390.png)
- [Overview, narrow phone dark](web-final-overview-dark-320.png)
- [Earnings, desktop light](web-final-earnings-light-1440.png)
- [Preferences, phone dark](web-final-preferences-dark-390.png)

These `web-final-*` viewport images are the current primary evidence. Earlier full-page captures can place the sticky header partway down a stitched image and should not be used as the latest overview proof. The final desktop observation measured scrollY=0, header bottom=80px, and main heading top=112px. Route resets now scroll immediately to the top; explicit anchor navigation retains scrolling.

## Functional checks

### Navigation and preferences

- Desktop primary navigation: Overview, Orders, Earnings, Shop. Shop groups profile, pricing/finishing, and availability.
- Desktop Shop keyboard test: Enter opens; the first destination receives focus; Tab reaches the next destination; Escape closes and returns focus to Shop.
- Clicking the page outside the account dropdown closes it.
- Phone Menu exposes six workspace destinations, with no repeated account links. Its observed height at 320px was approximately 336px inside an 844px viewport. Escape closes and returns focus to the Menu trigger.
- The separate account menu contains only Preferences, Help & support, and Sign out. Appearance and event mute controls live on Preferences.
- Selecting Light theme and changing mute persisted after page reload. Both themes also persisted across the 42-route matrix.

### Pricing, finishing and availability

- Browser create → disable → rename → reprice succeeded for a disposable finishing service. An authoritative fixture read confirmed the final name, rate ₹30, and `enabled:false`.
- The native `window.confirm` used by the existing delete interaction stalled the browser automation extension on the final repeat. Deletion had previously passed in the in-app browser; API deletion passed again on 15 October. Disposable services were removed through the fixture API afterward.
- Browser pricing save showed the success message; only the existing numeric pricing fields are sent.
- Browser busy preparation estimate, timed Busy and business hours saved; 10:00–22:00 persisted after reload. Native time fields were exercised through their accessible value API because this runtime's generic `fill` did not commit their values.
- Availability refresh keeps the form mounted so its success message remains visible. Existing timed Busy shows its actual expiry and offers “Keep current timer”; saving another field does not clear that timer.
- On 15 October, **24 fixture API requests passed** covering persisted partial pricing, negative/string rate rejection, legacy service/percentage payload rejection, finishing add/duplicate/invalid/edit/disable/delete/404, actual status validation, partial hours, timer clearing, settlement shape, and unchanged order snapshots. Pricing/status were restored and temporary services removed. The earlier fuller fixture pass completed 66 requests, including the 20-service cap.

### Analytics and exports

- Six fixture orders produce six total orders, one in every real state, one completed paid order, ₹36 completed shop earnings, and two cancelled/expired orders. Active paid orders do not count as earned.
- Earnings use only the existing `vendor_amount` payment snapshot on paid, completed orders. Missing snapshots produce “Unavailable” and a missing-order count; customer total minus fee is never substituted.
- Dates group by order placement in Indian Standard Time. Date controls support Today, Last 7 days, Last 30 days, and custom dates up to one year. The daily trend groups into weeks for longer ranges.
- An invalid date range showed an inline message, disabled CSV export, and left the all-date action queue available.
- The overview and earnings CSV exports downloaded successfully. Inspection confirmed all six order states, blank earnings for active/cancelled/expired orders, and ₹36 only for the completed paid order. Customer names, phone numbers and document contents are excluded.
- Transfer history uses the existing `/shops/me/settlements` response. Filtering transfers to Today hid the historic ₹72 record while the authoritative all-time unsettled balance remained ₹36. Transfer CSV downloaded with date, amount, order count, and reference.
- Analytics explicitly disclose the latest-500-order client limit. They do not claim complete historical reporting or a backend analytics API. The unsettled balance remains independent of date filters. No automatic payout action exists.

### Order handling and public discovery checked earlier

The earlier browser pass verified pending → accepted → ready_for_pickup → wrong pickup code (inline error preserved) → correct code `012345` → completed. All six filters and fresh sign-out/sign-in routing passed. PDFs retain the existing authenticated document-view contract.

Earlier public checks covered landing → workspace chooser → get-app at 1440/390 in both modes, loaded artwork, theme persistence, scrolling and truthful unavailable-download fallback. Current public source navigation contains Home, About, Help, For print shops and Get the app, with a top mobile menu and outside-click/Escape/focus-return logic.

## Design comparison and intentional differences

- Active W01/W02/W03 and partner frames were inspected before implementation. Current individual artwork, exact exported semantic Light/Dark values, Manrope/Inter, control shapes and rounded panels are retained. Source reconstructions in `design/local-figma/previews` are diagnostic references, not app backgrounds.
- The user's subsequent instruction overrides the Figma website sidebar and mobile bottom tabs. The final implementation uses top website navigation. The metrics-first overview and date/CSV reporting follow the user's subsequent dashboard request.
- Pricing retains supported paper-size and sides fields; finishing uses the actual vendor-defined service CRUD instead of inventing a separate stapling field.
- Availability uses the real Open/Busy/Closed states. There is no independent “Paused” order stage or editable open-shop queue estimate.
- Registered shop name/address/contact remain read-only because no supported update route exists. Actual cover/owner photos, locality/location, KYC and payout forms remain available; no shop gallery capability is implied.
- Partner registration keeps required account name/phone/email/password separate from the supported shop-registration request. Account profile email edits and DOB are not wired on the website.
- Get-app links and QR depend on actual configured URLs. No app-store availability or release timing is invented.

## Verification commands

From `vendor-website`:

```text
npm run build  — passed, 470 transformed modules
npm test       — passed, 9/9
```

The tests cover mixed lifecycle branches, IST boundaries, exact confirmed earnings snapshots, missing amounts, overlapping-page deduplication, safe CSV cells, sound deduplication, mute/background consumption, and interruption. `git diff --check` passed for the website and fixture; Git's LF/CRLF notices are normalization notices, not whitespace errors.

## Remaining validation limitations

The final public-header render pass was blocked after the native delete confirmation stalled the browser runtime. Reconnecting the tab and a fresh Brave tab both timed out; a fresh in-app browser was unavailable. Therefore **the final top public menu has source inspection, but does not have a completed new desktop/phone browser pass**. Earlier discovery screenshots predate that navigation correction. This report does not label that final public-header check as passed.

Production OAuth, real uploads/KYC/media hosting, live notifications/audio hardware output, real downloads/store destinations and production payment/settlement integrations were not submitted or exercised. Event-sound policy is covered by the adapter tests; audible output still benefits from device testing. Fixture checks demonstrate frontend behavior against existing shapes, not a production backend certification.

## Public header follow-up — 16 October 2026

The earlier public-header browser limitation is resolved by a bounded Brave pass on the final source at 127.0.0.1:5174. At 1440×900, Home/About/Help/For print shops/Get the app render in the 80px top header; no broken images or document horizontal overflow were observed. At 390×844, the top Menu opens a 300×273.6px panel inside the viewport with those five destinations. The first link receives focus, Escape closes and returns focus to Menu, clicking below the panel closes it, and selecting About navigates and closes it. The viewport override was reset afterward. This pass covered Light mode; the earlier public Light/Dark page captures remain separate evidence.

Current captures: [desktop](web-public-final-1440.png), [phone](web-public-final-390.png), [expanded phone menu](web-public-final-menu-390.png). This follow-up supersedes only the final public-header limitation above; the production/device integration limitations still apply.
