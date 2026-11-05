# Printlly mobile motion, themes and layout specification

Updated 11 October 2026. Status: implementation specification with the limited Figma progress recorded below. UPI restrictions and runtime appearance switching are not implemented in the app. No application or backend code was changed for this specification.

## Scope and evidence

Prioritize the existing React Native / Expo 57 customer app, with matching website behavior and Flutter-ready token names. There is no Flutter app in this repository. Preserve order, authentication, upload, payment verification and document-lifecycle contracts.

The approved identity is Paper in Motion: individual illustrated people and a folded-paper mascot, cream, plum, aubergine, lime and apricot, rounded structured layouts, Manrope headings and Inter body. Use the five imported role PNGs independently. Use a single relevant mascot state in each selected interaction; do not place the full asset sheet in a product screen. No emojis, unsupported reviews or invented marketing metrics.

The Figma motion gallery is on page 13, root `65:29`, in file `GLk1d6IiNCnsEFIEIVogwm`. The 20 GIFs and five role PNGs are imported individually. Gallery playback has shown repeated poses, so the GIF-to-state mapping is **not visually validated**. Imported GIFs must pass the asset checks below before product placement. The source pack's 2-second decorative sequences do not measure upload or payment duration.

Observed Figma progress: the shared `Semantics` collection now has Light and Dark modes with 19 dark color overrides. All 43 editable mobile screens have been duplicated onto `14 Mobile customer — Dark`, page `65:1414`. Dark M19, root `65:2112`, has been rendered and checked. Dark M07 has a 240ms Smart Animate transition; M19 in both themes has an existing 280ms transition. This establishes selected working transitions and a dark screen set, not completed motion, all-screen rendered validation, or an implemented app theme selector.

Inspected sources: `PRODUCT.md`, `design/REDESIGN_BRIEF.md`, `docs/REDESIGN_BACKEND_GAPS.md`, `userapp/src/screens/CheckoutScreen.js`, `PaymentScreen.js`, `PrintPreferencesScreen.js`, `SettingsScreen.js`, the existing screen inventory and the motion pack manifest. Motion values follow the installed transitions-polish scale where purpose matches; interaction restraint, tabular numbers and concentric corners follow make-interfaces-feel-better. Device rendering and Figma transition playback remain to be tested.

## Semantic variables: Light and Dark modes

Use the existing shared Figma `Semantics` collection and its Light/Dark modes. Bind text, fills, strokes and icons to semantic variables, rather than creating a duplicate theme collection or replacing hex values individually. The token table below specifies intended semantic roles; reconcile these names with the existing collection during handoff. A screen's theme change must not reset entered fields, selected shop, dropdown selections or scroll position. The current app has a static theme; System/Light/Dark runtime selection and local persistence remain frontend work.

| Semantic token | Light | Dark | Use |
| --- | --- | --- | --- |
| `color.canvas` | `#FFF7E8` | `#19121F` | Main screen background |
| `color.surface` | `#FFFFFF` | `#241B2D` | Cards, list rows, input background |
| `color.surfaceRaised` | `#FFFFFF` | `#30243B` | Sheets, menus and dialogs |
| `color.textPrimary` | `#2C1838` | `#FFF7E8` | Headings, amounts, main labels |
| `color.textSecondary` | `#65516C` | `#CCBED4` | Body support text |
| `color.textMuted` | `#786180` | `#B6A5C1` | Secondary metadata; still readable |
| `color.action` | `#6D35B1` | `#C5A0F6` | Primary action, selected navigation |
| `color.actionPressed` | `#53258D` | `#AD7FE5` | Pressed primary action |
| `color.onAction` | `#FFFFFF` | `#2C1838` | Text/icon on primary action |
| `color.selection` | `#EDE4F5` | `#3F2955` | Selected option/card background |
| `color.onSelection` | `#53258D` | `#E8D9FB` | Selected label and icon |
| `color.controlBorder` | `#8A7399` | `#83718F` | Boundary when required to identify a control |
| `color.divider` | `#E5DCEA` | `#4D3C5B` | Decorative/nonessential separators |
| `color.accentLime` | `#D8F36A` | `#D8F36A` | Illustration/accent surfaces; use aubergine text |
| `color.accentApricot` | `#FF9E79` | `#FF9E79` | Illustration detail; not small white text |
| `color.error` | `#A12F4D` | `#FF9CB0` | Error text and icon |
| `color.errorSurface` | `#FFF0F3` | `#442132` | Error message surface |
| `color.success` | `#365112` | `#D8F36A` | Success text/icon |
| `color.successSurface` | `#EFF6D7` | `#303B23` | Success state surface |
| `color.focus` | `#6D35B1` | `#D8F36A` | Focus ring; verify against adjoining surfaces |

Keep the approved illustration colors intact in both themes. Use a light paper backing or a restrained surface outline only where cream artwork loses its edge; do not invert skin tones, recolor entire raster characters or add a large white rectangle around every image. Dark mode has quiet dark data surfaces and brighter action contrast; it is not a global color inversion.

Calculated opaque sRGB contrast samples:

| Foreground/background | Ratio |
| --- | --- |
| Light primary text / cream canvas | 15.23:1 |
| Light secondary text / white surface | 7.13:1 |
| White / light plum action | 7.52:1 |
| Light control border / white surface | 4.21:1 |
| Light error / error surface | 6.28:1 |
| Dark primary text / dark canvas | 17.18:1 |
| Dark secondary text / dark surface | 9.36:1 |
| Dark muted text / dark surface | 7.20:1 |
| Dark action text / lavender action | 7.52:1 |
| Dark selected label / selected surface | 9.49:1 |
| Dark control border / dark surface | 3.72:1 |
| Dark error / error surface | 7.05:1 |

These are token calculations, not a rendered-screen audit. Inspect transparency, disabled states, photo overlays, focus ring adjacency and illustration cropping in the actual layouts. Body text target is at least 4.5:1; essential control boundaries and icons target at least 3:1. Do not use a low-contrast divider as the only input boundary.

## Shared layout and type

- Main handset reference: 390 × 844 logical pixels; also review 360 × 800, 320 × 568, large handsets, landscape and 200% text scaling. Respect actual top/bottom safe areas rather than hardcoding an iPhone notch.
- Use 20px horizontal screen padding at 390px, 16px on narrow screens; 4px spacing scale. Body 16/24, supporting text 14/20, field labels 14/20 semibold, section headings 20/28, page headings 28/36. Do not shrink body text to force a one-page composition.
- Minimum interactive hit target: 48 × 48 logical pixels. Main button height: at least 52px. Cards: 20–24px radius; controls: 12–16px. For a 16px inner radius with 8px inset, use a 24px outer radius.
- Prices, counts and six-digit pickup codes use tabular numerals. Long filenames can wrap to two lines, followed by format and server page count. Keep full filenames available in a detail view or accessibility label.
- Choose viewport-first only when essential content fits after safe areas, header, navigation, keyboard and font scaling. Viewport-first screens must allow overflow scrolling when needed. No screen should clip recovery actions to preserve a visual composition.
- Use one vertical scroll owner per screen. Lists own their scroll; do not nest a same-axis scrolling list inside a ScrollView. Sheets can own a bounded options list while the underlying screen is inert.
- In Figma, create the handset as the fixed clipping viewport and a separately named vertical content frame. Set overflow on that content, with sticky header/footer outside it. A screenshot of a long frame does not demonstrate correct scrolling.

## Screen-by-screen scrolling decisions

| Screen / state | Default layout | Fixed elements and overflow rules |
| --- | --- | --- |
| Sign-in unavailable | Viewport-first | Small character, clear explanation and recovery actions; overflow on short screens |
| Phone entry | Viewport-first form | Primary action above keyboard; shrink/hide decorative character before pushing the field out of view |
| Login OTP | Viewport-first form | Code group, error and resend affordance remain reachable; overflow with keyboard or large text |
| Account setup | Scrollable form | Focused field scrolls above keyboard; footer CTA above keyboard, with reserved content inset |
| Home | Vertical scroll | Home/Shops/Orders/Profile navigation fixed; hero character does not consume the whole initial viewport |
| Upload: empty | Viewport-first | Upload CTA and constraints visible; optional compact character; overflow fallback |
| Upload: selected, progress, partial failure | Vertical file list | Continue footer fixed; reserve its height in the content inset; per-file retry/remove stays beside affected item |
| Print preferences | Vertical scroll | One expanded document by default; fixed Continue; per-document settings and order-wide notes clearly separated |
| Choose shop path | Viewport-first | Two clear routes when a shop is preselected; overflow fallback |
| Shops / Select shop | Scrolling list | Search/filter header and optional selected-shop CTA fixed; map does not create an unbounded nested scroll |
| Shop details | Vertical scroll | Photos, pricing, finishing services, location and queue guidance; Print here CTA fixed |
| Review and Checkout | Vertical scroll | Compact shop/document summary and expandable receipt; UPI on the footer's left and Pay ₹amount on its right |
| Payment: preparing / confirming | Viewport-first | Honest status text and restrained loading indicator; accessible recovery after failure; no fake countdown |
| Gateway checkout | Gateway-owned surface | Provider manages its payment controls; do not overlay a second pay button or cover its dismiss action |
| Payment failure / uncertain return | Overflow-capable recovery screen | Amount, current status, Check status / Retry when permitted, Support; no compulsory character ceremony |
| Order placed | Viewport-first | Verified payment confirmation and prominent six-digit pickup code when supplied; View order visible; receipt behind details; overflow fallback |
| Order tracking | Vertical scroll | Real status timeline, shop, document summary and events; pickup action reachable; stale update indicator stays readable |
| Pickup code | Viewport-first ticket | Large six-digit server-issued code, shop and collection instructions; overflow at large type; no moving code |
| My orders | Scrolling list | Status filters fixed; list scroll offset retained when returning from details |
| Saved shops | Scrolling list | Navigation fixed; empty state viewport-first with overflow fallback |
| Profile | Vertical scroll | Account and support actions; avoid oversized avatar header that hides account options |
| Settings / appearance | Vertical scroll | System/Light/Dark appearance selector; unsupported notifications state remains honest |
| Help and support | Vertical scroll | FAQ accordions, existing chat entry, configuration-dependent contacts; no invented response-time promise |
| Chat | Message list scroll | Composer anchored above keyboard; preserve reading position; new-message affordance if user is reading older messages |
| Notifications | Scrolling list | Empty/error state overflow-capable; do not imply notification preference persistence exists |

Sticky footer layout: height is measured from its actual content and safe-area inset. Content bottom padding equals measured footer height plus 16px. With a keyboard, move the form CTA above it when the action relates to the focused form; avoid retaining bottom tab navigation above the keyboard. Tapping outside input should not silently discard entered data.

## Dropdowns, sheets and selection controls

Use exposed segmented or radio choices for short binary decisions: black & white / color, A4 / A3, single / double sided. Use a numeric stepper plus editable number for copies with the existing validation limits. No tiny desktop dropdowns for these frequent handset decisions.

Use a selection sheet for longer lists or vendor finishing services. The field shows its label and selected value before opening. The sheet has a title, current selection, 48px option rows, a visible close action and a bounded list; it scrolls if options exceed the available height. Prefer a native platform picker for system-like selections when that matches the established navigation.

Single selection applies and closes; multiselect finishing services keeps the sheet open and commits with Apply. Cancel/back dismisses staged multiselect changes. Empty vendor services show a plain unavailable message, not invented binding/lamination options. A disabled service includes the reason. Services remain per document and vendor-defined. Order-wide instructions remain outside the document selector.

Cap a selection sheet at 85% of the usable viewport, with its options list scrolling inside and its Apply footer fixed. A sort sheet may offer Price, Rush and Distance only where the existing result data supports that order; Distance requires coordinates. Appearance offers System, Light and Dark.

Open at 250ms with opacity and small surface transform; close at 150ms. Do not animate option labels individually. Background taps/back dismiss the active sheet once; repeated taps cannot open stacked copies. After dismissal, restore focus to the invoking control. Screen readers announce title, selected values and selection state; an open sheet traps interaction within its controls. On desktop, an anchored dropdown stays within the viewport and scrolls internally; on mobile, promote long menus to sheets. Theme variants include closed, open, selected, pressed, disabled, empty and error states.

## Motion tokens and interruption rules

| Token | Value | Purpose |
| --- | --- | --- |
| `motion.press` | 120ms | Button scale 1 → 0.96 → 1; label stays legible |
| `motion.quick` | 150ms | Dropdown/dialog dismissal, label replacement, compact feedback |
| `motion.selection` | 180ms | Selection fill/stroke transition; static check/radio remains |
| `motion.fast` | 250ms | Navigation, sheet/dialog open, tabs and accordion |
| `motion.panelOpen` | 400ms | Infrequent larger drawer reveal |
| `motion.panelClose` | 350ms | Large drawer dismissal |
| `motion.success` | 500ms | One-off success check/ticket emphasis |
| `motion.stagger` | 40ms | Infrequent grouped entrance, at most 4 items |
| `motion.distance` | 8px | Short screen/content reveal |
| `motion.easeSurface` | cubic-bezier(0.22, 1, 0.36, 1) | Surface movement and resizing |
| `motion.easeSwap` | ease-in-out | In-place text/icon crossfade |
| `motion.easeContinuous` | linear | Genuine active spinner |

Animate opacity and transforms for ordinary feedback. Do not blur price, code or error text, animate large layout changes at every keystroke, or bounce dismissals. The source GIF duration is independent of these UI transition durations. A longer decorative sequence runs alongside a usable screen; it never gates a tap.

Every interaction is interruptible or safely replaceable. New selection cancels the prior selection transition; a closing sheet cannot still receive taps; double Pay taps cannot launch duplicate sessions. Leaving a screen stops decorative playback. Returning to a screen does not replay success unless a new real event occurred. Static labels/icons communicate every state without motion.

## Major customer actions and selected features

| Element / trigger | UI motion | Artwork / live-state rule | Reduced-motion behavior |
| --- | --- | --- | --- |
| Welcome / first sign-in visit | Character opacity 0 → 1 and translateY 8 → 0, 250ms | `01-welcome` plays once only if verified; static role art otherwise | Static character, no travel |
| Login code request / verification | Field focus and inline helper crossfade; check 500ms only on actual success | `02-verification`; login code is distinct from pickup code; production auth unavailable branch retained | Immediate label/icon state |
| Upload picker returned | New file rows reveal 150ms | `03-upload-empty` optional on empty state; no repeated hero animation per file | Rows appear without movement |
| Upload request active | Per-file actual progress where measurable, otherwise spinner + Uploading | `04-upload-progress` decorative only; never drives numeric progress | Static mascot plus honest status label |
| File successfully processed | File row check 500ms; continue enabled by valid file state | `05-upload-complete` once; server page count shown only after returned | Immediate check and uploaded label |
| Upload partial failure | Error message appears 150ms beside failed file | Retain successful files/settings; retry affected file only; `17-error-recovery` only after mapping validation | Error text, Retry and Remove immediately |
| Per-document option changed | Selected fill 180ms, total label crossfade 150ms | Optional static `06-print-settings`; no character dance for every copy increment | Instant selection and amount update |
| Document accordion | Height/clip open 250ms, no scrolling jump | Expanded document identity remains visible; preserve other document settings | Instant expand/collapse |
| Shop results request | Stable skeleton/list region; loading text | `07-shop-search` once, not an endless whole-character loop | Static loading state |
| Shop selected | Selected card stroke/fill 180ms; footer shows chosen shop | `08-shop-selected` optional once; actual availability and prices remain readable | Immediate selected check |
| Save shop | Icon/fill crossfade 150ms plus Saved label | Update only with request outcome; restore unsaved state on failure | Instant icon and label |
| Pay with UPI pressed | Tactile 120ms, CTA switches to Preparing secure checkout | `09-payment-processing` once; server order creation and provider checkout govern progress | Static preparation/confirmation label |
| Returned from UPI app | Crossfade to Hold on / Confirming payment, 150ms | Concise status, no repeated receipt math; never show success from app return alone; await server verification/order status | Same status label without transition |
| Payment verified paid | One check/ticket reveal 500ms and optional approved art | `10-payment-success` once; only after verified paid response; stack resets away from spent checkout | Static confirmed state |
| Order pending | Optional one-time entrance 250ms | `11-order-pending`; label Awaiting shop acceptance; no printing progress | Static status and events |
| Partner accepts order | Timeline active marker crossfade 150ms | `12-order-accepted` once; label Accepted; estimate is informational, not countdown | Immediate Accepted label |
| Server says ready_for_pickup | Pickup ticket reveal 500ms | `13-ready-for-pickup` once; do not auto-advance based on animation time | Ticket appears immediately |
| Pickup code shown/copied | Code remains fixed; copy feedback crossfade 150ms | `14-pickup-code` optional outside digit area; only server-issued code after paid state; confirmation text for Copy | Static ticket and Copied label |
| Server says completed | One check 500ms | `15-order-completed` once; no collection success before partner code verification | Static Completed label |
| Reorder after deletion | Explain re-upload requirement inline | Completed/expired files cannot be reused as if stored; retain allowable settings without pretending files exist | Same explanatory state |
| Orders/shops empty | Optional character entrance once | `16-empty-orders` only for appropriate empty state; shop empty state uses matching art | Static empty-state art |
| Support entered | Composer/list visible immediately | `18-support` or `support.png` in entry/empty state, not behind conversation messages | Static support character |
| FAQ opened | Accordion 250ms; preserve reading position | No extra animated mascot | Instant answer expansion |
| Appearance switched | Background/text crossfade 150ms at most | System / Light / Dark; do not fade the whole app through blank white | Immediate theme change |
| Order events disconnected | Inline stale status appears 150ms | Last known actual state + Try again; no fictitious new stage | Static disconnected label |

Partner/admin GIFs are separate role assets: `19-partner-queue` and `20-admin-review`. Use them only in relevant role surfaces or walkthroughs, never as customer payment confirmation. The partner lifecycle remains Accept → Mark ready → Verify pickup code → Complete; admin monitoring remains read-only.

## UPI-only checkout and recovery

The Printlly checkout has one compact footer: **UPI** on the left, **Pay ₹amount** on the right. The left side identifies the supported method; it is not a dropdown when there are no alternatives. The right side is the only payment launch action, with the final amount in its accessible name. Remove card/wallet rows and avoid repeating the same bill arithmetic in multiple cards. Pickup is the only supported fulfilment option; do not offer working delivery.

The checkout direction draws from Swiggy's discussion of bringing method, amount and payment action into the cart, while keeping Printlly's own brand and a normal accessible tap action. It does not imply Printlly has Swiggy's measured results or automatically require slide-to-pay. [Swiggy Design: Healthy friction in UX](https://medium.com/swiggydesign/healthy-friction-in-ux-a46c800cb479).

Keep the full itemized receipt in an expandable **Price details** section: subtotal, relevant document/services charges, platform fee and final total remain available before payment. Its disclosure has a clear expanded/collapsed state, keyboard/screen-reader support, and no hidden charge. The fixed footer reserves its safe-area and content inset; on large type or a narrow device it can grow into two rows without clipping the amount or shrinking labels.

Provider-owned UPI handoff opens after Pay. On return, use the short heading **Hold on** and the supporting line **Confirming payment**, with a small honest indicator. After verified paid response, lead with **Your pickup code** and the server-issued **six digits** as the prominent static element, followed by the shop and **Show this at collection**. Use tabular numerals, sufficiently large digits and clear grouping; the code is not an input. Copy and View order are secondary actions. Receipt math is behind details rather than competing with the code.

Uber's PIN verification demonstrates a prominent code tied to a real-world handoff; this is an inspiration for hierarchy, not a copied Uber surface or a changed Printlly verification contract. Uber's referenced ride PIN is four digits; Printlly retains its server-issued six-digit pickup code. [Uber PIN verification reference](https://www.uber.com/hk/en/newsroom/pinhk/).

Product recovery copy stays brief: **Payment not completed**, **Try again**, **Check payment status**, and **Get help**, as appropriate to the real state. Do not put technical instructions about retrying the same order, signatures, gateway identifiers or endpoint sequencing in the product UI. The implementation rules below retain those protections in the handoff.

Current code is not UPI-only: CheckoutScreen offers UPI, card and wallet; PaymentScreen passes `prefill.method`, which does not restrict provider methods. Razorpay documents a frontend UPI-only display configuration using a block with `instruments: [{ method: 'upi' }]`, matching `sequence` and `preferences.show_default_blocks=false`; the merchant account must have UPI enabled. This is feasible without changing server payment payloads, but is not implemented here. [Official UPI-only example](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/sample-code/).

For Android WebView, Razorpay requires `webview_intent: true` and handling the external payment app deep link. Current PaymentScreen does not explicitly configure these. Resolve and test the React Native WebView handoff/resume path before treating external UPI app launch as working; inspect the versioned Expo 57 docs before writing that integration. [Official Android WebView UPI Intent instructions](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android).

The general design must not depend on manual VPA collect: Razorpay documents its deprecation effective 28 February 2026 with specified exemptions, including iOS transactions. Use provider-supported Intent/QR as appropriate to the platform, with the documented collect-hide configuration where applicable; do not promise identical Android, iOS and desktop gateway controls. [Official collect migration guidance](https://razorpay.com/docs/announcements/upi-collect-migration/standard-integration). Device and merchant-account verification remain pending.

State sequence and recovery:

1. Review the selected shop, document settings and final total, with itemized charges accessible under Price details. If the shop closes before creation, preserve documents/settings and route to Choose another shop. A busy shop remains orderable; show its real estimate without a blocking warning.
2. Create the real Printlly order with the existing server-calculated price, then request the provider order for that same order ID. Show Preparing secure checkout. Disable repeated payment launch taps.
3. Open the provider-owned UPI surface. Provider/device capability determines available UPI flows; do not invent merchant VPA, QR, UPI PIN fields or UPI app availability in Printlly. If a supported external app flow opens, background/resume is not payment confirmation.
4. On provider success, submit the existing signature/payment identifiers to the existing verify endpoint. Show Hold on / Confirming payment while waiting. Never display a pickup code or confirmed success before the server response permits it.
5. On verified paid, show confirmation and prioritize the server-issued six-digit pickup code when supplied. Reset navigation so back cannot return to the spent checkout and create another order.
6. On deliberate provider dismissal, retain the unpaid order and route back honestly; do not label dismissal as paid or as a server cancellation. Resume payment only while the order remains payable.
7. On failed payment, show a recovery label and Retry payment for the same existing order, preserving receipt/settings. On ambiguous return or verify-network failure, check the existing order/payment status before offering a fresh payment attempt; do not encourage paying twice. If an automatic status refresh is absent, label the action Check payment status as a proposed frontend behavior requiring verification of existing read endpoints.
8. If paid already, route to the confirmed order. If expired, explain that the upload must be repeated where its file lifecycle requires it. Existing support chat handles unresolved discrepancies; no invented refund ETA or automatic refund action.

The system does not emit a separate `printing` state. Use `pending`, `accepted`, `ready_for_pickup`, `completed`, `cancelled`, and `expired`, with readable customer labels. Keep payment `created`/`paid`/`failed` distinct from the print lifecycle.

## Reduced motion, playback and asset acceptance

- Default to the operating system's reduced-motion preference. Show the matching reduced-motion PNG or a static role PNG rather than an animated GIF; reduced-motion stills need not be imported into Figma to specify their source mapping.
- Decorative 2-second GIFs are play-once assets where the runtime can control playback. If an imported GIF loops indefinitely and cannot be reliably stopped, replace it with a static pose plus a controlled native reveal; do not claim play-once behavior because a manifest says so.
- Genuine indeterminate progress may use a restrained native indicator with a spoken/static status; never loop the whole character as a substitute for live request state.
- No autoplay motion on every tab return, every list row, every keystroke or every option selection. Pause offscreen/background assets. At most one decorative animated character is visible per handset screen.
- The user requested individual assets. Keep separate layers for each role illustration and UI chrome; a raster character is not an editable limb rig. Figma can animate its layer position/opacity or play an embedded GIF; limb animation requires separately authored parts/source artwork. Do not promise smooth rigged character motion from a flat PNG.
- Before approving any GIF: compare its first/middle/final frames to its source still and manifest, verify correct pose and badge, confirm alpha edges, cropping, visual quality and loop behavior in Present view. Test `01-welcome`, `04-upload-progress`, `10-payment-success`, `13-ready-for-pickup`, `17-error-recovery` and `20-admin-review` individually to investigate observed repeated artwork; then audit all 20. A filename alone is not proof that the correct media fill is attached.

## Figma build and handoff acceptance

Create editable mobile component sets with theme variable bindings and state variants for buttons, document rows/settings, selection sheets, shop cards, receipt/footer, loading/error recovery, order timeline, pickup ticket and tab navigation. Name transition nodes consistently so Smart Animate maps intended layers. Ordinary data controls remain native editable text/shapes even when the illustration is raster.

Provide Light and Dark prototypes for Upload → Settings → Shop → Review → UPI handoff → Confirmation → Tracking → Pickup. Add upload partial failure, location denied/no results, shop closed, payment dismissed/failed/uncertain, order updates disconnected, expired and production sign-in unavailable branches. Use a visibly labeled provider handoff placeholder in Figma; a demo transition is not a real payment session. Do not auto-confirm a payment or advance order status on an After delay trigger.

Demonstrate sheet open/selection/dismiss, document accordion, scrollable review, fixed amount/CTA, keyboard-safe form and reduced-motion route. Show system theme selection as a proposed local appearance preference; persistence is a frontend task, not an invented backend preference. Existing notification toggles remain unavailable until their implementation is verified.

Implementation adapters: use the established React Native animation mechanism after inspecting installed dependencies; use native-driven opacity/transform where supported, measure dynamic content for sheet/accordion layout, and clean up animations on unmount. Do not introduce GSAP into the native app. Matching website transitions may use the existing web animation stack. Flutter handoff maps these names/timings to AnimatedSwitcher/AnimatedContainer/Curves or explicit curves; it does not create Flutter source files.

Review both themes at the specified viewports, normal/large text, keyboard visible, all dropdown states, hardware/gesture back, interrupted transitions, slow/offline request states, reduced motion, provider return and screen-reader traversal. Confirm no footer covers the last receipt row, no full-screen character delays a major action, no fake progress or unsupported order state appears, and the UPI-only surface remains true in the actual provider checkout on supported test devices. Record observed failures before calling the motion and themes complete.
