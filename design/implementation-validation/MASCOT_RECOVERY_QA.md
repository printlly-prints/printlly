# Mascot recovery implementation audit — 17 October 2026

## Inputs inspected

- User-supplied `C:/Users/HP/Downloads/Printlly_Mascot_Reactions.zip`, extracted to `design/imports/mascot-reactions/Printlly_Mascot_Reactions`.
- README, nine individual original and optimized illustrations, supplied React Native component, reactions.json, screen-mapping.json, figma-state.json and validation.json. Overview inspected as an index only; it is never a runtime asset.
- PRODUCT.md, design/REDESIGN_BRIEF.md, docs/REDESIGN_BACKEND_GAPS.md, userapp/AGENTS.md and exact Expo 57 reference.
- Figma design-to-code skill read. No Figma connector tools were exposed in this session; high-fidelity get_design_context output could not be obtained. Existing user-authorized browser fallback used for rendered inspection. This is a verification limitation, not a claim of connector-based or pixel-exact implementation.

## Rendered Figma observations

Live browser inspection of active mapped nodes (archived graphics excluded):

- Components 347:547: all nine individual static reaction variants.
- Handoff 353:5282: compact placement, static PNG limitation, real request recovery, payment uncertainty and inline validation rules.
- New app E01/E02/E03 (351:5641, 351:5676, 351:5711) shown together; E04/E05/E06 (351:5746, 351:5781, 351:5816) shown together.
- Existing M09 partial upload 78:8495, M21p pending 78:9387 and M21c cancellation 78:9417; dark M21 failed 102:12327.
- Website outage desktop 351:30061, and dark mobile offline/outage/not found 351:30669, 351:30745, 351:30821.

App slots: 96px art beside status heading, supporting message below, safe-area footer for full-screen recovery. Web: 144px desktop / 96px mobile art beside heading and message; horizontal desktop actions stack on mobile. No illustration banners or overview-sheet screens. Runtime retains existing navigation/chrome and the user's more readable dark tokens rather than restoring the older near-black Figma canvas.

## Contract boundaries

No new backend capability is required by this rollout. Payment result is unknown on confirmation network errors; status checking must not reopen checkout. An explicit UPI action is separate, existing verification proof and provider identifiers are retained, and only server-confirmed paid allows pickup code. Paid is not ready. No unverified refund/not-charged promise.

Successful upload identities survive failure/retry of sibling files; PDF/image conversion and server page-count authority remain unchanged. Authenticated current-session 401 routes through existing auth; 403, resource404 and expired document410 are not universally treated as login expiry. Field validation and failed chat message controls remain inline. Mascots remain outside customer avatar choices.

## Validation

Implementation and runtime QA results are recorded below after checks complete. Source-pack structural counts are supplier evidence, not application test results.
## Verified implementation results

- Native app: 63 tests passed after recovery, read-cooldown and opening integration. The opening-stage regression test passes for the latest clouds-only recovery variant (all 36 authored clouds retained, every paper/flight layer omitted).
- Website: production build passed; 13 tests passed, including bounded account/URL-scoped GET cooldown. Twelve mapped desktop/mobile Light/Dark screenshots and actual browser recovery/auth checks passed. See [website evidence](WEB_MASCOT_QA.md).
- Payment: four actual Expo browser captures in Light/Dark; status checks performed reads with zero provider-order creation requests, no unpaid pickup code, no overflow or runtime errors. Native provider callbacks cannot be validated by the browser harness.
- Android APK built and installed on the connected Samsung A04e. Physical initial Home loaded actual local-fixture shops. Removing only the USB fixture forwarding produced the actual offline state; retry while disconnected retained that state. Restoring forwarding and tapping Try again restored Paper Street Print from the affected API reads. See `mascot-android/physical-offline.png` and the three physical XML captures.
- Physical Settings shows App opening animation and sound enabled, with no separate event-mute control. Native opening audio logged prepared and started once; perceived pleasantness is not an objective audio test.
- Nine native optimized assets are byte-identical to the supplied pack. Website ships only its five used reaction families; those copied compact assets match the supplied pack. Overview is never rendered; human avatar eligibility remains unchanged.

## Latest startup refinement

When Home displays full offline/service recovery rather than Add files, it reports that no upload target is available. Opening keeps the dense clouds uncovering the recovery page and removes paper-fold, plane and file-landing layers; the paper/flight audio is skipped. Normal Home retains the authored paper journey. Reduced-motion and disabled-opening behavior remain static/skipped. This is a deliberate user-requested variance from the source opening.

## Remaining gaps

- Figma connector high-fidelity context remains unavailable; comparison used live rendered browser references and supplied mappings, not connector output. Exhaustive pixel parity for every source screen is not claimed.
- Physical testing covers real offline/retry and startup smoke; the full screenshot matrix uses the actual Expo web rendering with intercepted test responses. Native keyboard/provider cancellation, late capture and real gateway confirmation still require a configured test gateway and device scenarios.
- Production customer phone sign-in remains unavailable under the existing build restriction. Session recovery reaches that existing authentication state rather than inventing a production SMS service.
- For cross-origin website deployments, the backend/proxy must expose Retry-After through CORS for browser JavaScript to read it. No backend contracts were changed for this rollout.
- Partner/public website reuses the recovery components; the unmapped exhaustive admin rollout is outside this change. Field and chat-message errors remain inline by design.

Shared shop-photo placeholders now use an exact square icon line box with Android font padding disabled, centering the default storefront glyph inside circular cards. Remote image behavior remains unchanged.


Physical clouds-only verification: installed update cold-launched with the fixture tunnel temporarily removed. Reviewed physical-cloud-recovery.mp4/contact sheet: dense clouds uncover the offline screen, no folding paper, plane or landing. Current-process native audio log contains prepare only, with no start. Tunnel restored in finally; Try again recovered Home. The normal Home flight is covered by existing motion tests. See mascot-android/physical-cloud-recovery-contactsheet.jpg.


Final shared shop-icon fix physically verified after installation: placeholder occupies the full photo width/height in normal layout. First circle spans y894–976 (centre935); icon text spans y912–957 (centre934.5), a 0.5px difference. Screenshot physical-shop-icon-centered.png inspected. Final APK includes the latest generated Hermes bundle and the revised paper cue (packaged hashes checked).

