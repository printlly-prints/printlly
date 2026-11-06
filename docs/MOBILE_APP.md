# Paprout mobile implementation

The Expo customer app now shares the approved Paprout paper/ink/CMYK identity. Existing document upload, per-file preferences, shop selection, server-priced checkout, verified payments, pickup and support routes remain in place.

## First implementation pass

- Shared theme: paper `#FAFAF7`, ink `#242426`, readable cyan actions `#007C9C`, pale cyan surfaces and restrained yellow/magenta accents. Status labels keep their distinct semantic colors.
- Manrope headings and Inter body text match the website. Only the five used font assets are loaded and bundled.
- Home has a new illustrated print desk, clearer actions, safe-area padding, skeleton loading and retry feedback. Failed refreshes retain previously loaded data.
- Navigation, cards, forms, preferences, pricing, tracking and pickup use the same central tokens. Four bottom destinations remain: Home, Shops, Orders and You.
- Upload and empty-order screens use the approved Paprout character artwork. Customer profile details stay read-only because the API has no profile-edit endpoint; placeholder edit buttons were removed.
- Real email/password customer sign-in and registration replace the development-only phone demo in the root navigator. Existing API methods and token persistence are reused, with a customer-role guard, submission loading/error handling and request timeouts. Unconfigured API builds show an honest disabled state.
- Shared buttons use Reanimated 4.5.1 press transitions (120ms, scale 0.97); skeleton opacity pulses indicate loading. Reduced motion removes scale/pulsing. Copy steppers use optional native selection haptics, with visual feedback retained.
- Expo packages are aligned on SDK 57 patch versions. React Native remains 0.86.3. The web dependencies enable a browser preview of the same React Native screens.

The website's approved hero headline is retained in the mobile home screen. App identity and launcher assets remain Paprout. Artwork came from the already-approved CMYK adaptations under `vendor-website/public/art/themes/`, converted to native PNG assets under `userapp/assets/art/`.

## Run and configure

Install dependencies in `userapp`, configure `EXPO_PUBLIC_API_BASE_URL` using `userapp/.env.example`, and run the existing Expo scripts. Physical phones need a reachable LAN or HTTPS API URL; `localhost` on a phone points to that phone. No backend credentials belong in public Expo environment values.

- `npm start`: Expo development server / Expo Go.
- `npm run web`: browser preview.
- `npm run check`: pure customer-auth, role-guard, theme contrast and asset checks.
- `npx expo install --check`: SDK dependency compatibility.
- `npx expo export --platform android --platform ios`: native JavaScript/assets export. This does not create an APK or signed iOS binary.

The old demo phone/OTP modules remain unregistered; there is no demo login route in the current app. Phone OTP authentication would require a real provider and server verification.

## Verification and limits

- Auth validation, non-customer session rejection, theme contrast and asset checks passed.
- All 69 screen/component/helper modules parsed successfully.
- Expo's SDK compatibility check passed after patch alignment.
- Android and iOS Metro/Hermes JavaScript exports passed. Native device builds, touch/keyboard behavior and animation performance require physical-device validation; no Xcode or Android emulator is installed here.
- Browser checks cover sign-in/account-mode switching, password visibility and phone-width layout without an API configuration. Evidence is under `design/mobile-validation/`.
- Automatic approval review blocked starting an interactive preview against an isolated test API, reporting only “blocked by policy.” No live API authentication, document upload, shop selection, checkout or payment verification was performed during this pass.
- Nonbreaking dependency fixes removed the reported high/critical audit findings. Four moderate findings remain in Expo's build tooling dependency chain; npm's proposed forced fix downgrades Expo across SDKs and was not applied.

## Installed mobile guidance

13 skills were installed in the user's local Codex skills directory and will be discoverable on the next turn:

- [Official Expo skills](https://github.com/expo/skills): `expo-overview`, `expo-native-ui`, `expo-design-system`, `expo-animation`, `expo-data-fetching`, `expo-router`, `expo-ui`, `expo-dev-client`, `expo-upgrade`, `eas-app-stores`, `eas-workflows`.
- [Software Mansion](https://github.com/software-mansion-labs/skills): `react-native-best-practices`, including animation and gesture references.
- [SwiftLee](https://github.com/AvdLee/SwiftUI-Agent-Skill): `swiftui-expert-skill` for platform-specific SwiftUI work. The app remains Expo/React Native for both platforms.

Ponytail and the existing shared components govern the size and structure of the implementation. Platform guidance comes from the [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and the installed skills. Reanimated runs the native motion; native stack transitions are preserved rather than recreated in JavaScript.
