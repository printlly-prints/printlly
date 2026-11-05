# Printlly / Paper in Motion handoff

16 October user refinements supersede earlier profile/theme findings: the user approved additive backend persistence for optional contact email and DOB, while keeping this phone on the disposable test API. Authenticated GET/PATCH `/auth/profile` and optional registration fields now support those details; sign-in email/credentials are unchanged. Home uses one top-right notification bell and the bottom Profile tab, refreshes API shops and recent orders, and retains no extra profile shortcut. The supplied folded-paper emblem replaces the native app icon/splash branding. Native Dark mode uses a user-requested, lighter neutral palette with restrained purple and muted status greens; the original website tokens remain unchanged. Device QA and exact verification are recorded in `docs/ANDROID_LOCAL_QA.md`.

Current implementation direction, 15 October 2026: the user supplied/downloaded the `.fig` file and explicitly instructed local asset inspection followed by implementation. Current active screens, variables and embedded images are decoded in `local-figma/`. The website and existing React Native/Expo customer flows now use shared runtime tokens, original artwork, local human avatars and Light/Dark/System appearance. The later navigation/dashboard refinements below supersede conflicting source layouts. Physical-device and live-provider checks remain separate from implementation and local fixture validation.

Current verification: the Android debug APK compiles successfully (`com.printlly.customer`, min API 24, target API 36, four ABIs), and all four supplied event MP3s are present in its resources. Android Studio/SDK are installed; the user chose to connect a phone later. See [Android setup and pending device checks](../docs/ANDROID_LOCAL_QA.md). No phone installation or live payment is claimed. Web and native-preview evidence is being finalized under `implementation-validation/`; these reports supersede dated pending-implementation statements in the historical design notes below.

Current implementation evidence supersedes the dated design-history notes below:

- User override, 14 October 2026: upload has one “Choose files” action accepting PDFs and supported images, replacing separate photo/file actions in M07. Website navigation belongs at the top, including responsive partner navigation; native-style bottom tabs on the website are superseded. The Expo app uses Home/Shops/Orders/Profile tabs for its main sections and stack/back navigation for task screens and modals, respecting native safe areas and keyboards. These changes are intentional deviations from the source composition.

- The public website flow `/` → `/auth` → `/auth/get-app` was rendered at 1440 and 390 in Light/Dark and compared with actual Figma editor captures. Original individual artwork, local fonts and shared semantic tokens are used. Missing download configuration has an honest unavailable state.
- The Expo customer entry flow was exercised at 390×844 using the actual React Native components in a web preview: development phone/code → supported name → one of 16 human avatars → Home. Avatar choice is local per account; DOB/email are unavailable. These screenshots are a React Native web proxy, not Android device evidence. Hermes export passes; the native APK also builds. Final preview reports record the exact additional screens and interactions checked.
- Partner sign-in, dashboard and order handling were exercised against a loopback, in-memory API fixture. Pending → accepted → ready_for_pickup → completed passed; an incorrect pickup code retained the detail and input with an inline error. No production users, orders or payments were created. The shop-loading sign-in race was fixed and a fresh sign-out/sign-in landed directly on the existing shop's dashboard. Later top-navigation and analytics checks use separate final screenshots.
- Opening motion uses the seven original vector fold/plane assets, one short play, interruption cleanup and a static reduced-motion fallback. Loading waits only for actual application initialization, with no decorative minimum duration.
- Image uploads now convert JPEG/PNG to real PDFs before the unchanged PDF-only endpoint. The local HTTP flow independently parses page counts, compares prices and creates the existing order shape without accepting a client-supplied page count as authoritative. The fixture intentionally returns provider unavailable for UPI; real Intent/resume and provider confirmation still require an authorized test environment/device.
- The user-requested partner overview leads with date controls and metrics, with order trends, six-state counts, all-date action queues and CSV export. Earnings distinguishes completed paid `vendor_amount` snapshots, outstanding settlement balance and recorded external transfers. Missing snapshots and the latest-500-order reporting cap are disclosed. Source artwork remains elsewhere rather than burying business data below a decorative hero.
- M33 saved-shop source cards overlap at the same position. Runtime cards stack and use only fields returned by the saved-shops API; source price/queue/rush values are unsupported there. Account editing is read-only, with a working local avatar picker. Help uses the source support artwork and existing chat, with unconfigured contact placeholders hidden. No refund or response-time promise is invented.

Browser evidence is saved in `implementation-validation/`. Decoded source previews are diagnostic reconstructions and are not labelled as Figma screenshots or used as whole-screen implementation images. Physical Android keyboard, safe-area behavior, UPI Intent/resume and OS notification mute still require device validation; local browser fixtures do not establish those capabilities.

Implementation audit, 13 October 2026: [current repository/design audit](../docs/REDESIGN_IMPLEMENTATION_AUDIT.md) supersedes historical inventory assumptions below. The live file now has newer V2/V3 components, approved illustration/avatar assets, additional theme/state variables and archived prior screens. Design implementation must use current high-fidelity Figma context; the connector remains unavailable in this chat despite browser access. Manual server configuration was added, but OAuth discovery failed before authorization. Independent lifecycle/payment visibility fixes are in progress; no completed redesigned flow or screenshot match is claimed. DOB/email editing lacks profile persistence, and image support needs a validated client PDF conversion adapter with backend contracts unchanged.

[Editable Figma file](https://www.figma.com/design/GLk1d6IiNCnsEFIEIVogwm)

Status, 11 October 2026: native screen restyles and individual vector asset jobs completed; representative validation and manual prototypes remain in progress. Paper in Motion supersedes the rejected Swiss/cobalt direction. The full Figma request is unfinished. Website and Expo implementation has not started. Backend files remain untouched.

## Visual world and assets

Use warm ivory, plum actions, aubergine outlines, lavender panels, lime highlights and apricot illustration accents. Pair rounded paper cards with selective short offset shadows. An original folded-paper courier mascot and hand-drawn people connect upload, shop choice and collection. Avatars add personality without becoming fictional testimonials.

The supplied illustrations are aesthetic references; create new characters and compositions. No emoji icons. The mascot accompanies self-collection and must not imply delivery. Operational tables retain clear scanning; illustration must not obscure prices, errors or pickup digits.

The latest user instruction requires native vector illustrations only, as separate individual assets rather than a combined scene. Final artwork uses independent native components with editable curved paths/shapes. The native job reported 22 components and two component sets: PaperPal Phone/OTP/Verified (320 reference size), UploadStudent/Shopkeeper/PickupCustomer (360×460), four avatars (80), and PrintlyIcons with twelve 24-pixel variants. The user reported broken illustrations and requested one subagent per asset. Dedicated subagents then authored the three individual human SVG v2 assets and a separate PaperPal task authored three mascot poses. Root pasted SVG through the native Figma editor clipboard, producing editable frames/groups/paths inside the existing component masters. No PNGs or file upload were used. The master inventory remains 22 components. Generated PNG explorations in design/assets remain references only; the v2 PNG previews are QA only, not Figma artwork. No broad file-URL permission was granted or enabled.

Master IDs are preserved: UploadStudent 25:94, Shopkeeper 25:128, PickupCustomer 25:166 and PaperPal Phone/OTP/Verified 25:5, 25:33, 25:61. New Artwork / <asset> v2 frames sit at x0/y0; hidden Archive / original ... groups preserve earlier parts for recovery. Human poses are 360×460, PaperPal poses 320×320. PaperPal uses the matched layer name Artwork / PaperPal and the same 35 unique SVG IDs, including 20 paths, in each pose.

Root independently inspected all six illustrations at full size and in gallery, then checked updated instances in the website hero and M06 Home; no broken/cropped illustration was observed there. Independent mascot quality review passed an actual Figma screenshot. Proof captures: design/figma-validation/characters-v2.jpg, mascot-v2.jpg, login-motion-v2.jpg, website-hero.jpg and mobile-home.jpg. This validates representative rendering, not artist-level craft, user acceptance, every screen or full accessibility.

The user subsequently flagged awkward legs and rough curves in two screenshots. Root matched those screenshots to the older People & print scenes and Courier poses on page 10, then renamed that page to **10 Archive — superseded illustration drafts**. Active native masters are on **11 Illustration assets**; the student master is 25:94. Keep the old artwork recoverable but do not present it as the current direction. The direct connector check still returned no exposed Figma tools; inspection and page labeling used the previously authorized browser fallback.

A dedicated student curve review produced UploadStudent-v3.svg: softer right-knee silhouette/tangents, aligned cuffs, and rounded shoes on a consistent ground plane; upper body unchanged. Root reviewed the rendered candidate and inserted it as native **Artwork / UploadStudent v3** at x0/y0 inside master 25:94. The previous v2 artwork is hidden in **Archive / student v2 — previous curve pass**; original v1 archive remains hidden. Proof: design/figma-validation/student-v3.jpg at 110%. This is a modest refinement to a stylized pose, not a claim of artist-finished quality or user acceptance. No other character was bulk redrawn in this pass.

## Target tokens

| Role | Value | Flutter mapping |
| --- | --- | --- |
| background / ivory | #FFF7E8 | scaffoldBackgroundColor |
| surface | #FFFFFF | ColorScheme.surface |
| text / aubergine | #2C1838 | ColorScheme.onSurface |
| secondary text | #65516C | ColorScheme.onSurfaceVariant |
| action / plum | #6D35B1 | ColorScheme.primary |
| action foreground | #FFFFFF | ColorScheme.onPrimary |
| pressed action | #53258D | pressed WidgetStateProperty |
| selection / lavender | #EDE4F5 | ColorScheme.primaryContainer |
| selected foreground | #2C1838 | ColorScheme.onPrimaryContainer |
| highlight / lime | #D8F36A | decorative fill with dark text |
| illustration / apricot | #FF9E79 | decorative fill with dark text |
| essential outline | #2C1838 | ColorScheme.outline |
| error text | #A12F4D | ColorScheme.error |

Calculated contrast supplied during revision: ink/ivory 15.23:1, secondary/ivory 6.69:1, white/plum 7.52:1, white/pressed 10.41:1, plum/ivory 7.06:1, ink/lavender 13.14:1, ink/lime 13.09:1, ink/apricot 8.05:1 and error/ivory 6.51:1. White/apricot 2.02:1 and plum/apricot 3.73:1 fail normal-text contrast. Inspect actual rendered pairs. Pale fills alone are insufficient essential control boundaries; use dark outlines and visible focus.

Manrope headings and Inter body are verified available in Figma. Target roles: display 64/72, title 48/56, heading 32/40, section 24/32, body 16/24, label 14/20. Preserve body/label sizes in compact layouts. Use tabular figures in implementation and equal-width editable pickup digit cells when the Figma font feature cannot be authored. Support native text scaling.

Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96. Container radius 20–24; control radius 12–16. Hit areas at least 48 logical pixels. Selective offset shadows 2–4 pixels. States need text or shape as well as color.

## Responsive behavior

- Desktop reference 1440: 12 columns, 80 outer margins, 24 gutters. Domain-specific illustration supports a visible first-viewport action.
- Tablet reference 768: eight columns, 32 margins, 16 gutters. Stack public heroes and adapt partner navigation/detail panels.
- Phone reference 390: four columns, 24 margins, 16 gutters. Home, Shops, Orders and Profile are main destinations; task screens have visible back actions.
- At 320 width and large text, wrap labels/totals and stack metadata. Do not shrink type or targets to fit.
- Respect safe areas and keyboards. Sticky controls reserve content space; tall interiors need functioning scroll. Sheets preserve and restore focus.

These widths are reference compositions, not confirmed runtime breakpoints.

## Components and contracts

Buttons provide primary, secondary and text treatments with default, web hover, pressed, focus, loading and disabled states. Loading retains labels and prevents duplicate submission. Inputs preserve labels, entered data and recovery guidance. Home prioritizes Upload PDFs, active orders and saved shops. Saved shops must not show a configured-order total before configuration.

Each PDF retains color_mode, copies, paper_size, sides and exact vendor-defined services. Notes remain order-wide. Maximum ten PDFs; partial success and per-file retry; server-derived page counts. Services are charged once per document, independent of copies. Copy-to-all is explicit.

Shop comparisons use supported photos, availability, distance where known, configured totals, services and qualified queue/preparation estimates. Omit unknown values. No fabricated ratings, testimonials, metrics or guaranteed countdowns. Samples are labelled and arithmetically consistent.

Receipts itemize documents, services, platform fees and total. Unknown fees are not zero. Payment and order states remain distinct. Razorpay owns actual payment entry; no invented UPI credentials or payment QR. Pending payments offer checking/support; retry the existing payable order. Cancelled/expired orders require a new order.

Lifecycle: pending → accepted → ready_for_pickup → completed, plus cancelled/expired outcomes. No printing stage. Offline updates retain and label the last known state. A six-digit pickup code appears only from the existing paid-order response. The partner enters the customer's code. Sample Figma codes are illustrative. Completed/expired files follow existing deletion rules; reorders require re-upload.

Paid changes/cancellation route to existing support chat. Production phone authentication is unavailable; OTP is a development demonstration. Notification preferences and partner settings are unavailable/proposed. Contact details depend on verified configuration; no invented SLA. Pickup is the only fulfilment method.

Admin orders are read-only; partners own acceptance, readiness and collection. Admin settlements record externally completed transfers with an external payment reference; recording does not pay funds. Include verification review, rejection/resubmission and deactivation recovery.

## Motion and platform mapping

| Interaction | Target | Web | Expo | Flutter handoff |
| --- | --- | --- | --- | --- |
| Press | 120ms | CSS state transition | native feedback | state styling / AnimatedContainer |
| Selection | 180ms | fill/outline transition | animated state | AnimatedContainer |
| Detail sheet | 240ms | scoped CSS/GSAP transform | platform sheet | platform sheet / Curves.easeOutCubic |
| Screen | 300ms | route continuity | native stack | platform route |
| Login paper / upload / ticket | 300ms | authored continuity | native animated state | AnimatedSwitcher |

Ease-out cubic is the shared reference. The three-frame sign-in illustration demonstration is wired and played: Phone 25:4149 → OTP 25:4199 uses Smart Animate at 240ms, then OTP → Verified 25:4258 at 300ms. Changed shapes blend/dissolve rather than continuously morphing SVG paths. The Verified screen has a 48-pixel Replay animation button wired on click to Phone (25:4149) with Instant navigation; actual playback returned to Phone and the live label was verified. The form remains readable and its phone prefix is +91. No looping decoration beside OTP entry or automatic simulated server advancement. Demonstration outcomes need labelled controls. Prefer transform/opacity, scope GSAP work and clean up on unmount. Figma motion does not verify runtime performance.

Reduced motion is documented as instant navigation or a short dissolve with no traveling/folding artwork; the alternative Figma route is not wired or tested yet. Production respects web and OS settings. Flutter mappings are specifications only; no Flutter application exists.

## Attention maps and validation status

Attention boards are expert heuristic predictions, not observed heatmaps, gaze/click data or completed tests. Label primary focus, decision support, recovery risk and quiet context with text and outlines. Test scenarios remain proposed.

Native agents reported 13 website, 43 mobile, 22 partner, 16 admin and 22 grayscale screens; seven workflows; 121 variables (56 primitives, 65 semantic aliases); the earlier base library had 17 sets/68 variants and five type styles. The new illustration library reports 22 components/two sets. Website revisions added 18 native art instances and eight key mobile revisions added nine. The operational job revised 33 mobile, 22 partner, 16 admin and 20 handoff copies, replacing 28 tiny mobile specimens with native content. M10/M17 were inspected as readable; some inherited scaled typography remains. Historic totals of 178 roots/821 instances are superseded snapshots, not a current count. Counts are agent-reported rather than independently audited.

Root manually verified 16 actual links: one website CTA, twelve customer links M07 → M08 → M10 → M12 → M15 → M17 → M19 → M20 → M22 → M25 → M26 → M27 → M28, and three login-demo links: the two Smart Animate links above plus Verified → Phone Instant replay. Three flows exist: website, customer and [Illustration demo · Sign-in animation](https://www.figma.com/proto/GLk1d6IiNCnsEFIEIVogwm/Printlly-%E2%80%94-Paper-in-Motion-%C2%B7-Product-Redesign?node-id=25-4149&scaling=scale-down&content-scaling=fixed&starting-point-node-id=25%3A4149). The 1440 landing frame is fixed at 900 height; actual scrolling remains unverified. Full branch/back, partner, reduced-motion and accessibility validation remain incomplete. Some inherited typography still needs checking. Website and mobile implementation remains pending; backend untouched. Track evidence in FIGMA_REDESIGN_STATE.json.

Figma AI credits are exhausted until 1 November; no credits were purchased. Direct connector tools remain unavailable. User-authorized manual native editor work can continue. These constraints do not convert partial prototypes into completed flows.

## 16 October 2026 — print-options source variance

The app presents per-document print options inside expandable document cards, with one document expanded at a time, rather than reproducing the source's separate selector screens. This keeps each file's copies, colour, paper size, sides and supported finishing together while preserving the existing per-document API fields. It is an intentional implementation variance requiring design validation; it must not be described as a pixel-exact reproduction of those selector screens. Unknown required catalogue rates suppress the estimate; an unknown platform fee never becomes zero.

## Final report links — 16 October 2026

The final public website header now passes desktop and phone browser checks, including menu sizing, Escape/focus return, outside dismissal and destination navigation. See [website QA](implementation-validation/WEB_QA.md) and [native preview QA](implementation-validation/NATIVE_WEB_QA.md) for the exact evidence and remaining limitations. Native checks finish at 36 passing tests and a successful final Hermes export; the website has 9 passing tests, a successful production build and 42 passing partner layout cases. The Android debug APK is available; phone installation and device-only behavior remain pending at the user's choice.


## 17 October: checkout and opening corrections
- Review and checkout are now one Review & pay screen: editable document quantities, complete server price breakdown, selected shop and actionable UPI sheet. Existing Checkout route aliases the same screen for compatibility. No additional payment method or payment success is simulated.
- Physical A04e QA: real two-page synthetic PDF, copies increased to two, Stapling service; authoritative total ₹16. Restarting the local fixture before order creation retained the actual upload bytes. Payment correctly reported unavailable test UPI provider and withheld pickup code.
- Local fixture PDF uploads now have a bounded 24-hour temporary cache. Expired uploads return an actionable re-upload error. This is test infrastructure, not a production storage contract change.
- Latest user override permits the emblem inside the app for one second before motion, as well as the launcher icon. Home prepares behind an opaque opening. The dense clouds remain in place through folding. The opaque entry cover clears at 2.05 seconds, immediately before cloud retreat begins with plane translation at 2.10 seconds. Cloud timing is compressed to clear by 3.35 seconds (3.05 signed out), before the final unfold. The source sky background is removed so the retreating clouds directly uncover the full prepared Home page, rather than an empty purple page. Add files is measured before the landing. Once the reveal begins, touching Home cancels remaining decorative motion and permits normal interaction. Wing unfolding at 3.68 seconds and file unfolding at 3.84 seconds otherwise remain over Home. Reduced motion uses the static logo fallback.
- After user review, the original dense 36-cloud composition, sizes and tracks are restored. The adaptation removes only the decorative 33 two-node trail dashes (119 to 51 animated layers, including removal of the sky backdrop), retaining the paper poses. Individual cloud sprites remove expensive SVG filters; explicit stretch sizing and extra host bounds prevent Android clipping rounded overlaps. Shared source motion assets remain intact. Five fonts are embedded instead of fetched during startup. The straight crease uses a top-anchored native scale animation instead of JavaScript-driven SVG dash updates; complex static SVG component leaves are hardware-cached, while bitmap clouds and animated groups are not cached as whole surfaces.
- Opening audio uses a preloaded local native MediaPlayer cue, separate from notification channels. Following user review, the literal folding/flight/drop soundtrack is replaced by one short, soft paper-textured UI cue at the start plus a faint, smoothly faded movement cue during plane translation. Repeated creases, sharp swooshes and landing impacts are omitted. The App opening animation setting controls both opening motion and its cue. Confirmed-event cues have no in-app mute control; server confirmation, deduplication, Android permission, volume, silent/vibrate and DND rules remain enforced. Native playback was observed on the physical phone; perceived sound quality requires human listening.

## 17 October — mascot recovery rollout
See [mascot recovery audit and evidence](implementation-validation/MASCOT_RECOVERY_QA.md). Individual static poses are integrated with actual recovery behavior across the Expo app and React/Vite website. The latest user override keeps only the cloud reveal over full offline/service recovery, omitting paper/plane/landing and their audio when no Add files target is present. Backend payment, upload and order contracts remain preserved.

