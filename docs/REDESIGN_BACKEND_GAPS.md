# Printly redesign: backend observations

**17 October 2026 — approved queue extension:** the user explicitly requested backend queue/rush calculations. This overrides the original backend-freeze scope for this feature. See [QUEUE_PRESSURE.md](QUEUE_PRESSURE.md) for actual ready-transition timestamps, workload/throughput evidence gates, conservative fallback and additive API fields. Closed shops never carry a rush level. Historical output speed cannot be reconstructed from collection or `updatedAt` timestamps.

Reviewed 11 October 2026. Backend files have not been modified.

Implementation update, 14 October 2026: this is a contract audit, not a requirement to change the backend. Light/Dark/System appearance and per-account local avatars are now implemented. Local event-sound mute is being integrated separately from unsupported server notification preferences. Older references to static implementations below describe the audited starting point. Expo web screenshots provide layout evidence only; Android UPI handoff, notification-channel mute/DND and keyboard/safe-area behavior require a rebuilt binary and device checks.

**Saved-shop source discrepancy:** M33 places cards at overlapping coordinates and includes price/queue/rush fields absent from the saved-shops response. Stack runtime cards and display supported availability, distance and address; obtain a configured comparison through its existing endpoint rather than inventing a saved-shop total.

**Nearby-shop source discrepancy:** the active nearby composition includes demonstration pins, avatars, a configured print estimate and price filtering without uploaded documents. The public shop listing has no configured-order quote or ratings. Runtime uses supported search/location/rush information and actual shop photos; document comparison obtains prices through its existing endpoint. Generic source preparation-minute values are omitted where the queue response supplies only active counts and rush. Busy preparation guidance remains available when the actual shop response provides it.

**Partner analytics:** there is no analytics API or completion timestamp. Order metrics use fetched orders and their placement dates in IST, with capped-history scope shown. Completed earnings require server-confirmed payment and the stored `vendor_amount`; unknown snapshots remain unknown. Settlement balances/history come from the existing endpoint and record manual external transfers. Do not label placement-date trends as payout dates, lifetime totals or actual cash movement.

## Missing support

- **Page ranges (verified 14 October 2026):** the active website artwork/copy advertises page ranges, but current print preferences, order model and pricing controller have no page-range field. Remove the claim and keep full-document printing until this contract exists; do not silently submit an ignored field.
- **Partner onboarding source discrepancy (14 October 2026):** active P02 combines account and shop inputs but omits the required account name/phone fields. Preserve `/auth/register`'s existing shop-owner payload and separate account registration from the existing shop setup flow. No password-reset endpoint was found; route sign-in recovery to existing configured support instead of a fabricated reset request.

- **Customer profile edits (verified 13 October 2026):** User email persists at registration/auth response, but there is no customer profile-update endpoint. DOB is absent from the User schema, and avatar persistence is absent. Do not wire a working DOB/email/name save or claim server-persisted avatar selection. A local avatar preference must be described as local.
- **Image upload adapter (verified 13 October 2026):** the current upload controller requires both PDF MIME and `.pdf` extension; it rejects images. Preserve the backend and support PDFs AND images by implementing and validating client image-to-PDF conversion before the existing upload endpoint. Server page counts and prices remain authoritative. Enabling image selection without conversion is insufficient.

- **Separate printing stage:** the existing order lifecycle has no emitted `printing` state. The redesign must display `accepted` honestly and then `ready_for_pickup`; do not invent a Start printing API action.
- **Ratings and reviews:** the current shop model has no rating or review fields. Remove unsupported marketing ratings and testimonials from the redesign, or clearly mark them as demonstration content.
- **Verified marketing metrics:** the existing landing page's shop/customer counts and average rating have no verified source in this repository. They should not appear as factual proof in the new design.
- **Production customer phone authentication:** `userapp/src/constants/demoAuth.js` identifies the phone/OTP flow as development-only. `userapp/App.js` renders `AuthUnavailableScreen` outside development. The phone/OTP redesign is a specified journey, not evidence of production SMS verification; preserve the existing production restriction and design an honest sign-in-unavailable state.
- **Persisted notification preferences:** `userapp/src/screens/SettingsScreen.js` uses local component state and explicitly says the notifications switch has no effect. Do not present it as an operational server preference; show an unavailable state until support is implemented and verified.
- **Partner account/settings persistence:** `/settings` in `vendor-website/src/App.jsx` renders `ComingSoon`. A designed settings surface must be annotated as proposed and must not imply working save actions.
- **Customer self-service cancellation/change:** the existing support FAQ states that customers cannot cancel or change a paid order in the app. Route them to the existing support chat rather than inventing a cancellation action.
- **Verified support contact configuration:** `userapp/src/config/support.js` marks email/phone defaults as placeholders. Use the existing support chat and configuration-dependent contact blocks; do not invent a support number, inbox, or response-time promise.
- **Home delivery:** `userapp/src/screens/CheckoutScreen.js` exposes pickup as the only available fulfilment option and disables delivery as coming soon. The order model has no delivery address, courier, or delivery-fee contract. Do not design a working delivery selection or quote a delivery charge.
- **Automated vendor payouts:** `backend/controllers/settlementController.js` records transfers made manually outside Printlly; it does not call a payment gateway or send money. Admin settlement screens must say record transfer, include the external payment reference and confirmation, and never imply that recording a settlement pays the vendor.

## Already supported — do not rebuild

Shop photos, geographic coordinates and distance, pricing comparisons, vendor-defined finishing services, shop availability, live queue information, busy preparation guidance, saved shops, payments, pickup codes, and order events already have implementation support. Earlier annotations in `design/canvas.json` describe several of these as missing and are out of date.

## Design constraints

Treat preparation guidance as an estimate, never a guaranteed countdown. Payment pending/failed is separate from print order status. Show a pickup code only when the existing payment/order response supplies it. Preserve the existing upload, payment, and document deletion contracts.

Admin order monitoring is read-only (`backend/routes/adminRoutes.js`, `admin-panel/src/pages/Orders.jsx`). Accept, mark ready, and pickup completion remain partner actions; do not add an admin order-status mutation.

## Mobile platform

There is no Flutter project or Flutter/Dart SDK in this workspace. The user confirmed redesigning the existing React Native/Expo app and providing Flutter-ready design specifications.

## Frontend integration and validation gaps — no new backend requirement

The latest checkout direction is a compact footer with UPI on the left and Pay ₹amount on the right, an expandable accessible receipt, provider-owned UPI handoff, a concise Hold on / Confirming payment return state, and a prominent server-issued six-digit pickup code after verified payment. Product screens should not repeat receipt arithmetic or explain technical retry/order/signature rules; those protections remain in `design/MOBILE_MOTION_THEMES.md` and the existing integration contracts.

- **UPI-only gateway presentation:** current `CheckoutScreen.js` still offers card and wallet, and `PaymentScreen.js` passes only `prefill.method`, which does not restrict provider choices. Razorpay documents a frontend UPI-only `config.display` block, matching `sequence` and `preferences.show_default_blocks=false`. Merchant UPI enablement and actual checkout behavior require verification. This is a frontend configuration gap, not a missing backend payment API. [Official UPI-only example](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/sample-code/).
- **Android WebView UPI Intent and resume:** Razorpay requires `webview_intent: true` and dispatch of payment-app deep links. The current screen does not explicitly configure that handoff. Test launch, no supported app, app return, provider dismissal, interrupted network and server confirmation on supported devices. Returning from an external app is never sufficient proof of payment; retain the existing server verification and pickup-code issuance. No backend change is required by this proposed UI. [Official Android WebView guidance](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android).
- **Appearance runtime:** the editable Figma design now has shared Light/Dark semantic modes, 19 dark color overrides and a duplicated 43-screen dark mobile page. This does not implement System/Light/Dark selection, OS-preference handling, local persistence or runtime color bindings in the existing static-theme Expo app. Those are frontend tasks and do not require a new server preference API. Selected Figma renders/transitions are checked; full-screen rendered and reduced-motion validation remains pending.

No application or backend code was changed for these refinements. Existing authentication restrictions, price authority, payment signature verification, order states, six-digit server pickup-code contract and document deletion behavior remain required.

## Implementation clarification — 15 October 2026

JPEG/PNG conversion to PDF is now implemented on the client and exercised through a loopback upload fixture with independently parsed server page counts. The production PDF endpoint and document contract remain unchanged. Foreground event cues, persisted mute and semantic deduplication are implemented; actual Android channel/DND audio behavior awaits phone testing. DOB/email editing remains unavailable because the audited persistence contracts do not support those updates. No backend capability was added to fill these gaps.

## Approved profile extension — 16 October 2026

The user explicitly authorized backend profile persistence. The earlier unsupported-DOB finding is superseded by additive nullable `date_of_birth` (ISO calendar date) and `contact_email` fields. Authenticated GET/PATCH `/auth/profile` whitelist these two fields and return canonical public user details. Registration accepts them atomically. Contact email is intentionally separate from the existing sign-in email, preserving authentication contracts. Server validation rejects invalid/future dates, malformed emails and unsupported patch fields. The phone remains connected to the disposable loopback fixture at the user's choice; the source backend supports database persistence, while fixture values last only for that test-server process. No production database was accessed.
