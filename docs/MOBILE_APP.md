# Paprout mobile

The Expo customer app uses Paprout's paper, ink and CMYK palette, Manrope headings, Inter body text and the approved character style. The current implementation uses compact app layouts and functional copy. Marketing slogans stay out of the mobile UI.

The latest pass applies the approved character-feedback direction and reuses Reacticx, Pressto and Sonner Native motion templates. The greeting/header bell, inline per-document settings and saved-shop Undo are implemented. See [motion sources and validation](MOBILE_MOTION_SOURCES.md); the current screenshot is `design/mobile-validation/template-print-workspace.png`.

## Navigation contract

- **Print** is the document workspace: choose PDFs, inspect page counts and remove files. It contains no Shops or Orders previews or duplicate account controls.
- **Shops** owns browsing, saved shops and shop details.
- **Orders** owns the order list, tracking and pickup codes.
- **You** owns identity, notifications, settings/privacy and support. It has no Orders shortcut or unsupported profile editor.
- Shops, Orders and You use independent native navigation stacks. Opening a detail retains the tab bar; switching tabs preserves the current detail and Back history.
- Print setup is a self-contained full-screen modal stack: files → preferences → shop → review → checkout → payment. A shop's “Print here” starts this task without switching tabs. Closing returns to the originating screen.
- Verified/simulated payment removes the spent checkout and preserves the originating tab's state. Done returns there. Completed files are cleared from the Print workspace. Contextual order details from notifications open without redirecting into the Orders tab.

This follows the hierarchy and state-preservation principles in [Apple's tab-bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars). The app remains React Native/Expo for Android and iOS, with platform-native stack transitions.

## Artwork and motion

Read the Figma library's canonical action artwork, profile avatars and mascot reactions before creating concepts. Generated screen concepts and prompt records are in `design/mobile-concepts/`. `app-direction-v2.png` demonstrates the compact app direction; the implementation's tab responsibilities supersede its Home preview content. Concepts are generated images, not implemented screenshots.

The built-in Imagegen tool produced new mascot poses in the existing cream-paper, charcoal-outline, cyan-bag and pink-shoe style. Transparent sprites were cropped/resized for native use. Empty/offline order feedback and order confirmation use contextual mascot artwork. Adding a document triggers a finite paper-flight animation. It pauses off-screen and is static under reduced motion. No per-frame JavaScript state updates are used.

## Demo and live data

Without `EXPO_PUBLIC_API_BASE_URL`, the app defaults to isolated offline seeded mode. `EXPO_PUBLIC_DEMO_MODE=true` explicitly selects it; setting it to `false` disables the fallback. At the user's request, the interface has no demo/sample banners or labels. Auth uses separate storage keys. Seeded PDF selection never accesses personal files; shops/orders/support operate in process. Location prompts, sockets, analytics and real payment endpoints remain disabled. Order state resets on reload; profile appearance and default print settings persist per account on the device. The seeded confirmation does not process money.

Live mode retains customer email/password authentication, customer-role guards, timeouts, upload/retry validation, server page counts, server-priced checkout and verified payment behavior. Real shop data is never replaced with invented ratings, prices or testimonials. A reachable backend URL is still required for live use.

## Run and validation

From `userapp`:

- `npm start` starts Expo/Expo Go; `npm run web` opens the browser preview.
- `npm run check` checks auth validation, roles, contrast, assets, sample pricing/payment isolation and navigation state preservation.
- `npx expo install --check` checks SDK compatibility.
- `npx expo export --platform android` exports the native JS/assets bundle; it does not create an APK.

Checks passed for auth, contrast, demo quotes/totals, idempotent simulated payment, pickup progression, payment isolation, tab-history preservation and spent-checkout cleanup. Android Metro/Hermes export passed after the redesign.

Browser verification at 390px covered adding a sample file, opening/closing print setup without losing files, shop details retaining the tab bar, and tab switching retaining the shop detail. Implemented screenshots are `design/mobile-validation/print-workspace-v2.png` and `you-v2.png`.

An earlier version ran through a sample order on the USB-connected Android phone in Expo Go. Phone debugging was stopped at the user's request. This redesign has not been revalidated on physical hardware or an iOS device; release animation performance, native gestures and keyboard behavior remain unverified. Live API/payment verification and standalone signed builds have not been performed.

## Installed guidance

The installed Expo skills cover native UI, themes, animation, routing, data fetching, development clients, upgrades and EAS builds. Software Mansion's React Native guidance supplies the Reanimated patterns. SwiftLee's skill is available for future SwiftUI-specific work. Ponytail governs reuse and change scope. Reference: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
