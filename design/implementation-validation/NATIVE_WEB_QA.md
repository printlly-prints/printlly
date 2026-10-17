# Native application web-preview QA — closeout 16 October 2026

This report records the prior integration review's saved evidence, inspected again during closeout. The application is React Native/Expo; these captures are its React Native Web preview, **not Android device screenshots**. Native/device limitations remain below.

## Environment

The prior interactive run used `userapp/qa/start-preview.cjs` on localhost:8082 and the loopback-only, disposable in-memory `userapp/qa/fixture-api.cjs` on 127.0.0.1:8083. Synthetic documents and accounts were used. No production backend, customer data, SMS, gateway or real payment was exercised. Those preview services were no longer running at closeout; the native interactive flows were not rerun.

## Verified evidence from the integration review

| Flow | Observed result | Saved evidence |
| --- | --- | --- |
| Unified upload | One picker accepted a two-page PDF, PNG and JPEG; images were converted to PDFs. The server returned independent page counts 2/1/1. | `native-webproxy-upload-complete-light-390.jpg`, dark counterpart |
| Per-document options and comparison | PDF retained Colour, 2 copies, A3, double-sided through options, comparison, review and checkout. The fixture's authoritative combined total was ₹63. | `native-webproxy-options-dark-320.jpg`, `native-webproxy-compare-dark-320.jpg`, `native-webproxy-review-dark-320.jpg` |
| Checkout | Three files, configured PDF item ₹56 and image items ₹2 each; UPI footer Pay ₹63. Expandable receipt and scrolling were exercised at 320px. | `native-webproxy-checkout-expanded-light-320.jpg`, `native-webproxy-checkout-dark-320.jpg` |
| Payment unavailable | Local gateway intentionally returned unavailable; error/recovery screen shown, with no invented payment success. | `native-webproxy-payment-unavailable-light-320.jpg`, dark counterpart |
| Confirmed pending order | A manually server-confirmed fixture order visibly shows Payment confirmed, Awaiting acceptance and pickup code 012345. | `native-webproxy-paid-pending-light-320.jpg` |
| Shops and orders | Actual fixture shops, supported prices/services and order lists rendered; neutral image fallback used where no photo exists. | `native-webproxy-shops-light-390.png`, `native-webproxy-shop-prices-light-390.png`, orders 320/390 captures |
| Profile/preferences | Profile and Help rendered at 320px; Light → Dark was exercised. Account details remain read-only where persistence is unsupported. | profile/settings Light/Dark 320 captures, `native-webproxy-help-dark-320.jpg` |
| Saved shops and notifications | Saved-shop removal and mark-all-read were exercised through their existing fixture contracts. | `native-webproxy-saved-light-320.jpg`, `native-webproxy-notifications-light-320.jpg` |
| Support chat | Loaded two older messages, marked conversation read, sent a message locally, retained draft after one deliberately injected 503, then retried successfully. Successful-send scrolling was checked after its fix. | `native-webproxy-chat-send-error-dark-320.jpg`, `native-webproxy-chat-context-light-390.jpg`, chat Dark 320/390 captures |

Some captures precede subsequent fixes: the review capture shows the earlier incomplete base-price explanation, which prompted the receipt correction. It is diagnostic evidence, not proof of the final receipt text. The prior reviewer subsequently completed the rendered recheck: mixed PDF/PNG/JPEG options persisted, increasing an image copy changed ₹63 → ₹65 and reverting returned ₹63; Review no longer displayed the unrelated catalogue rate; collapsed checkout showed Print ₹60 + fee ₹3, and expansion showed base ₹36 + paper ₹20 + sides ₹4 + fee ₹3. Regression tests cover the same authoritative receipt and replacement by a created-order snapshot. Only the later unknown-money edge guard was not browser-retested.

## Automated and build evidence

The native closeout reports **36/36 Node tests passed**. Coverage includes strict paid/live-state/six-digit pickup gating (including leading zeroes), terminal navigation suppression, real lifecycle stages, stale payment callbacks, durable payment proof/recovery, UPI-only request construction, image conversion/limits, support message merging, appearance, avatar eligibility, foreground sound dedup/mute and notification permission behavior. Unknown/null/empty/nonfinite monetary values now remain unavailable while genuine zero remains zero.

The local core fixture smoke previously passed image-to-PDF upload, raw image rejection by the unchanged PDF API, independent PDF page counts, server order authority over forged client counts, unpaid null OTP, unavailable provider recovery and explicitly confirmed fixture state. This was an integration simulation, not gateway certification.

The Android debug APK was built successfully; setup, artifact and physical-device follow-up are documented in `docs/ANDROID_LOCAL_QA.md`. Final bundle/export results are recorded by the native closeout and parent handoff rather than inferred here.

## Remaining validation

- The saved paid-pending image proves that positive state only. Full rendered unpaid/malformed/terminal code suppression and order-context attachment/new-message behavior were still in progress when the earlier browser review ended. Unit coverage is present; those full browser assertions are not claimed as passed.
- No connected Android phone/emulator was used. Native keyboard resizing, hardware back, system safe areas, document picker permissions, UPI intent/provider return, audible event output, DND/channel settings and reduced-motion behavior on hardware remain device checks. The user will connect their phone later.
- No real payment, live webhook, production auth, storage upload, remote push delivery or external support message was submitted.
- The comparison uses original assets and active source hierarchy. Local Figma reconstructions are diagnostic references; this is not a claim of pixel-perfect Android parity.

