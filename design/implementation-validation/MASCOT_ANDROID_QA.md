# Android mascot recovery implementation — 17 October 2026

Source: user-provided `Printlly_Mascot_Reactions` pack, `reactions.json` and active `screen-mapping.json`. Root inspected the rendered active Figma screens before implementation. Runtime uses the nine individual optimized transparent PNGs, not the overview sheet. The art is static; no facial animation is claimed. Total optimized artwork is 116,805 bytes.

## Implemented app surfaces

- Home: first-load offline/service fallback with real Retry and Get help; partial refresh errors retain the successful section and last confirmed data.
- Shops: request-specific offline/service/access/rate-limit recovery, no matching shops and search/filter recovery.
- Shop details: closed/removed shop mascot and choose-another-shop action; current shop refresh performs the existing GET.
- Compare shops: no matching shops and real price-comparison retry, preserving files/options; request sequencing prevents stale results from winning.
- Upload: partial/unsupported/processing failure mascot, successful files kept, individual-file and failed-files-only retry. Continuing explicitly includes only successful files.
- Orders: real list retry; tracking retains last confirmed status on network/service failures, supports reconnect, and uses cancelled/expired artwork with current-shop discovery. A successful order-list response that no longer contains the opened order routes to the real NotFound fallback.
- Authentication: a 401 on the currently authenticated request shows session-ended recovery. The action clears that session and returns to existing authentication. Login rejection, ordinary 404 and forbidden access do not force unrelated logout. Invalid demo login codes retain inline validation with the mapped compact access pose beside the status heading.
- Render fallback: safe-area-aware, scrollable service illustration and retry; no unverifiable claim that a pickup code is still valid.
- Payment and checkout: implemented by the separate payment agent; see its payment QA results and screenshots under `mascot/`.

Existing screen frames, shared semantic colors, buttons, navigation and APIs are reused. Main-tab failures keep their actual tab navigation; stack fallbacks use stack safe areas. Light and revised dark themes are both covered. Reduced-motion artwork remains exactly static. Chat send failures and individual field validation remain inline. Mascots are not customer avatar choices.

## Recovery safeguards

`requestRecovery.js` classifies actual HTTP/network errors and reads Retry-After. A bounded, memory-only GET cooldown isolates Authorization + fully encoded URL/query. Polling/focus/manual refresh cannot issue another matching read until the actual server deadline. No server body is cached by this gate. The actual Axios browser smoke (`userapp/qa/mascot-cooldown-qa.cjs`) additionally passed focus/navigation blocking before expiry and successful retry afterward. Its synthetic browser responses expose Retry-After through CORS; native React Native response headers do not have this browser visibility restriction. POSTs and payment creation are never retried by this mechanism. Tracking and shop/comparison screens discard stale responses.

The six new recovery/cooldown tests pass. Root also reports the full 63-test app suite passed. New meaningful tests cover partial-upload sibling preservation and failed-only retries, session/forbidden/missing-resource distinctions, seconds/date backoff parsing, poll/manual cooldown enforcement, expiry, account/query isolation, bounded memory and untouched mutations. These tests pass independently; the root agent runs the full suite/build.

## Evidence and limits

`userapp/qa/mascot-recovery-qa.cjs` exercises the actual Expo application at localhost:8082 in a disposable browser context with synthetic intercepted existing API responses. It captures light/dark states and asserts retry failure remains recoverable, successful retry restores data, successful uploads are not resent, and expired-session recovery returns to actual authentication. The expanded 18-case interaction/capture run passed in both themes, including actual missing-order and unsupported-file cases. A further eight targeted captures (Home shop placeholder, NotFound, partial upload and unsupported file, both themes) passed explicit font-ready and mounted-image complete/naturalWidth checks; see `mascot-android/loaded-image-recapture-results.json`. Four further closed-shop/no-match image-ready recaptures also passed; see `mascot-android/shop-image-recapture-results.json`. All affected delayed-image captures were overwritten with fully loaded images. Representative offline, outage, session, upload, missing-page, cancelled, shop-unavailable, no-match and payment captures were visually inspected against the mapped Figma geometry and actual artwork.

Screenshots are in `mascot-android/`. Logo-only captures from an early interrupted run are not valid evidence; the final harness explicitly waits for the opening logo to detach before capture. Payment checks separately verify zero charge-creation requests when checking status.

Browser screenshots demonstrate actual app layout and read recovery, not Android WebView/UPI behavior, OS keyboard behavior or device performance. Native APK/device validation is a separate root-agent check. No production backend, database, payment gateway or charge was used.

The existing production phone-auth restriction remains: no SMS/OTP backend was invented. The demo flow still explicitly uses its existing development code. Session expiry therefore returns to the existing supported authentication surface for that build. No universal external deep-link scheme was added; the missing-resource path reaches NotFound through actual navigation.
