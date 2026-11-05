# Redesign implementation audit

Reviewed 13 October 2026. This records observed evidence, not completion of the redesign.

Update, 14 October 2026: the user explicitly directed downloading and implementing from the local `.fig` file. The downloaded copy is `design/local-figma/printlly.fig`; its ZIP archive and Kiwi canvas data were decoded locally into active screen, component, variable and image inventories. This user-directed local workflow replaces the connector-only implementation gate below. No additional Figma connection troubleshooting is required for implementation. Active artwork must be selected from this current export, not earlier snapshots.

## Repository and ownership

Latest user refinements, 14 October: one upload picker accepts PDFs and supported images; website navigation is at the top with concise primary destinations and compact grouped menus. Native main sections use tabs, while task screens use stack/back navigation. Dashboard analytics and earnings controls are being expanded using existing order and settlement responses, inspired by date-filtered metric cards and the separation of earnings from payout records. Unknown vendor snapshots and capped history are disclosed rather than silently treated as zero or lifetime totals.

Local Android Studio/SDK setup is documented in [ANDROID_LOCAL_QA.md](ANDROID_LOCAL_QA.md). The approved SDK license, installed API 36 tools and generated native project do not establish a successful build or physical-device test; those outcomes are recorded separately.

- Website: `vendor-website`, React 18, Vite 5, Tailwind 3, React Router 6, Axios and Socket.IO. Public customers are directed to the app; no customer web checkout exists. Preserve that boundary. Partner sign-in, shop setup, pricing/services, availability, order handling and earnings already exist.
- Customer Android app: `userapp`, Expo 57.0.20, React Native 0.86.3, React 19.2.3, React Navigation, AsyncStorage and WebView. `userapp/AGENTS.md` requires the exact Expo v57 docs, which the Android audit consulted. No Flutter implementation is present or planned.
- Separate website, Android and backend-contract subagents audited the existing implementation. Backend work is read-only.
- Dependencies were initially absent. Installation/build results must be recorded independently from visual or device validation. No Android emulator/adb was found during the initial audit.

## Current Figma evidence

The existing file `GLk1d6IiNCnsEFIEIVogwm` is accessible through the signed-in Brave browser. Read-only editor inspection found the current pages:

- `00 Start & workflows`, `01 Foundations`, `02 Components`, `03 Wireframes`.
- `04 Website`, `05 Mobile customer`, `14 Mobile customer — Dark`, `06 Partner`, `07 Admin`.
- `08 Prototype & Flutter handoff`, `09 Attention & usability`.
- `13 Motion & role assets — 25 imported`, `15 Avatars & approved illustrations`, `16 Reduced motion — customer`.
- `10 Archive — superseded illustration drafts`, plus Archive sections within active pages, must be excluded. Review boards are evidence awaiting validation, not automatically active screens.

The live file is newer than `design/FIGMA_REDESIGN_STATE.json`. The website includes light/dark frames at 1440, 768 and 390 widths; the dark 1440 landing was rendered and inspected. Its 900px fixed frame clips lower content in editor view; runtime scrolling still needs validation. Current illustrations differ from the older SVG snapshots, so those snapshots must not be assumed to be the active artwork.

The Variables UI shows 91 primitives, 81 prototype-state variables and 73 semantic variables. Semantics has Light and Dark modes. Observed page/default surfaces are `#FFF7E8`/`#FFFFFF` in Light and `#19121F`/`#241B2D` in Dark; primary text is `#2C1838`/`#FFF7E8`; action is `#6D35B1`/`#C5A0F6`; on-action is `#FFFFFF`/`#2C1838`; pressed action is `#53258D`/`#AD7FE5`. These are audit observations, not a complete export or implementation token source.

`Printlly/Button` was inspected as a rendered component set: Primary/Secondary/Text and Default/Pressed/Focus/Disabled/Loading, 15 variants, a Label property, auto-layout and semantic bindings. Its description still says cobalt focus while the rendered active palette is plum; that description is stale. Active V2 input, menu/document/shop cards, navigation, pickup code, chat and V3 nearby-map/action-artwork components were observed in the layer inventory. Archived expanding-ring nearby feedback must not be reused.

## Figma access diagnosis

The installed Figma 15.0.0 plugin declares the required Figma connector. Its skills are available, but no Figma MCP tools or tool-search capability are exposed to this chat. Browser access and the editor's “1 connection” badge do not establish callable design-context access here.

Following Figma's documented manual setup, a global Streamable HTTP `figma` entry was added at `https://mcp.figma.com/mcp`. It is enabled. `codex mcp login figma` fails before authorization with “OAuth metadata discovery failed … error decoding response body.” A separate HTTP request reproduced malformed chunk framing on `/.well-known/oauth-protected-resource/mcp` (`curl` error 56, “chunk hex-length char not a hex digit”). The authorization-server metadata endpoint returns valid JSON. Authentication has not succeeded; no access token was read, copied or invented. This diagnosis does not prove the hosted connector has the same failure.

The required Figma design-to-code skill mandates high-fidelity `get_design_context` output and initial screenshots before design implementation. Browser snapshots alone do not satisfy that requirement. Visual implementation and Figma comparisons remain pending; independent existing-contract fixes can proceed.

## Verified contract discrepancies

- Uploads currently accept PDFs only: `backend/controllers/uploadController.js` requires PDF MIME and `.pdf`, with 10 documents / 10 MB per document. Supporting user-requested images with unchanged backend requires a verified client image-to-PDF conversion pipeline, followed by the existing upload and server page-count/pricing path. Simply opening an image picker would fail.
- DOB has no User schema field. Email persists at registration, but no customer profile-update route exists. Do not present editable DOB/email/name as a working server save. Persisted avatars are also unsupported; local choices must be explicitly local and use only eligible human portraits.
- Pickup digits must come from a server-paid order: `payment_status === 'paid'` and exactly six digits. Guard render, copy, share and navigation. Route data or returning from UPI is insufficient payment evidence.
- Order stages are pending, accepted, ready_for_pickup, completed, with cancelled/expired branches. Existing native timeline and partner labels invent printing; these need correction.
- Checkout currently offers card/wallet and only a provider method preference. UPI-only display configuration, Android intent handoff and uncertain-return reconciliation remain required frontend work and device/merchant checks.
- There is no emitted ORDER_CANCELLED event or customer cancellation endpoint. Provider dismissal must not play order-cancelled audio or mark an order cancelled.
- Foreground custom sound support is absent; background push uses default sound. MP3s are application cue sources, MP4s are Figma audio carriers. Deduplicate real event delivery across API/socket/push by order ID + semantic event, respect mute, and never infer confirmation from animation or timeout.
- Production phone/OTP remains unavailable. Ratings/reviews, delivery, operational notification preferences, partner account saves and verified marketing proof remain unsupported as documented in `REDESIGN_BACKEND_GAPS.md`.

## Completion gates

Acquire active-frame high-fidelity context and exact assets, then implement one complete customer flow per platform. Validate contract checks and screenshot geometry at design widths in both themes before starting the next flow. Android safe areas, keyboard, large text, back navigation, UPI app return and reduced motion need device evidence; a successful bundle is not device validation. Report unresolved fields and discrepancies rather than inventing endpoints or screenshots.

## Completed contract checks before visual implementation

The website now labels the confirmed accepted queue and pipeline as Accepted and removes the fictional printing status mapping. Two lifecycle/earnings tests and the Vite production build pass. Android centralizes paid/live/six-digit pickup gating across render, copy, share and navigation, uses the four real timeline stages, and fences duplicate/stale payment callbacks. Retry checks the server order and retains the original verification proof after an uncertain verify response. Eight tests and the Android Hermes export pass. Full app-restart recovery remains to be validated because the current proof retention is in memory. Backend/API files are unchanged.

Existing npm packages installed with Windows system CA verification, without disabling TLS. Expo recommends newer v57 patch releases than the existing lockfile; these have not yet been upgraded. No Android runtime screenshot, physical-device UPI or keyboard/back-button pass is claimed.

The four supplied MP3 cues were copied individually into native/web media directories. Shared confirmed-event and deduplication policy tests pass (five tests). Playback adapters and persisted preferences still need integration; copying audio files alone does not make sounds operational.

## Public website flow validation — 14 October 2026

Landing → workspace choice → app handoff is implemented from active W01/W03/W02 at 1440 and 390 widths. Current individual customer/partner illustrations match the decoded image slots; all rendered images loaded. Desktop heading/artwork geometry is 56px and 173×260; phone is 22px and 92×138. Light/Dark/System appearance persists through navigation. Browser checks found no horizontal overflow in either theme. Source reference and implementation screenshots are in `design/implementation-validation/` (`figma-w01/w02/w03-light.jpg` and `web-w01/w02/w03-{light,dark}-{1440,390}.jpg`). Lower source content clipped by the 900px Figma frame is scrollable at runtime.

Discrepancies: source page-range copy was removed because it has no pricing/order contract. Missing app download configuration shows an unavailable state; no fake QR or working production phone sign-in is implied. Header app-handoff routes remain direct, while the hero uses the existing workspace chooser. Appearance and legal controls are added after source footer content. The partner setup source needs required name/phone fields and existing contract steps rather than its combined prototype form.

## Current validation — 15 October 2026

The website production build and all 9 tests pass. The final partner route/theme/viewport matrix passed 42 cases, including the compact top navigation, overview, earnings, pricing and preferences. See [website evidence and limitations](../design/implementation-validation/WEB_QA.md). The final public-header rendering check remains separately identified there.

The Android debug APK builds successfully with the four event MP3 resources. Android Studio/SDK setup is complete; the user will connect their phone later. Native browser-preview evidence does not establish physical keyboard, safe areas, UPI handoff, OS audio or device restart behavior. See [Android setup and device checklist](ANDROID_LOCAL_QA.md). Current implementations and reports supersede the dated starting-point findings above, including the previously missing image adapter and sound integration.

## 16 October 2026 — final native money validation

Added one strict, pure money parser and formatter shared by the receipt and price display. Absent, blank, invalid, negative and non-finite monetary fields display **Unavailable**; numeric zero and decimal numeric strings remain valid. A created order replaces the comparison snapshot even when its total is absent. Checkout disables Pay and fences its handler when that total is unavailable; order tracking no longer substitutes zero for missing server charges. Preferences estimates require every selected printing, paper, double-sided and service rate. An unknown fee retains a clearly labelled pre-fee estimate with no final total. The known mixed-document ₹60 + ₹3 = ₹63 quote is preserved.

Validation: `npm test` passed **36/36** native tests. `npx expo export --platform android --output-dir dist-android-final` passed, bundling **1,590 modules** and producing a **4.3 MB Android Hermes bundle**. These checks validate code and bundling, not physical-device behavior, UPI application handoff or audible cues. No native dependency/configuration changes were needed for this final patch.
