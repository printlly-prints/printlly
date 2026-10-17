# Local Android validation

The user authorized Android Studio/SDK installation and explicitly accepted Google's SDK license on 14 October 2026. This setup does not change the backend or enable production phone authentication.

## Installed tools

- Android Studio Rabbit 1 2026.2.1.8: `D:\Android\StudioPortable\android-studio\bin\studio64.exe`. The elevated EXE installer returned Windows cancellation 1223; the official portable distribution was installed instead. Its SHA-256 matched Google's published checksum.
- SDK: `D:\Android\Sdk`; platform tools 37.0.1, Android API 36 and build tools 36.0.0.
- Generated native project: `userapp/android`, ignored by Git; application ID `com.printlly.customer`. The generated Expo configuration requests NDK 27.1.12297006, which Gradle installs under the SDK.
- Gradle cache: `D:\Android\Gradle`, preserving space on C:.

The current network requires the Windows system trust store. Existing Oracle JDK 23 at `D:\Program Files\Java\jdk-23` supports `Windows-ROOT`; Studio's bundled JBR 25 did not support that trust-store configuration. Certificate verification stays enabled. Use the existing JDK for this host's command-line build.

## Build and connect

Native debug build passed on 15 October 2026: `:app:assembleDebug`, Gradle 9.3.1, 292 tasks (33 executed, 259 up-to-date), 2m 31s on the resumed build. APK: `D:\printlly\userapp\android\app\build\outputs\apk\debug\app-debug.apk` (184,143,342 bytes). Diagnostics: `D:\Android\printlly-build.log`. This proves APK compilation, not physical-device behavior. The user chose to connect the phone later; no phone installation, real UPI transaction or device audio verification is claimed.

Run the actual app against the disposable loopback fixture:

```powershell
# Separate terminals, from userapp
node qa/fixture-api.cjs
node qa/start-preview.cjs

# SDK device inventory; select an explicit returned serial
& 'D:\Android\Sdk\platform-tools\adb.exe' devices -l
```

To reproduce the native debug build on this configured machine, run from `userapp/android`:

```powershell
$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = 'D:\Program Files\Java\jdk-23'
$env:GRADLE_USER_HOME = 'D:\Android\Gradle'
$env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE'
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8083'
$env:EXPO_PUBLIC_POSTHOG_KEY = ''
$env:EXPO_NO_TELEMETRY = '1'
.\gradlew.bat :app:assembleDebug --console=plain --no-daemon --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx3072m'
```

On the USB phone, enable Developer options and USB debugging, connect a data-capable cable and approve the computer's authorization prompt. The app need not be installed beforehand. Once the APK builds, install it with `adb -s <serial> install -r <apk-path>`. For the development build, reverse phone port 8081 to Metro port 8082 and phone port 8083 to the fixture port 8083. Use an explicit serial for every device command.

The fixture has no production database, uploads or payment gateway. Development phone/code screens remain visibly marked as development behavior. Do not describe fixture login or a simulated payment response as production authentication or a real payment test.

## Required device checks

Verify opening/reduced motion, Light/Dark/System persistence, native status/navigation safe areas, small-screen scrolling, keyboard resize and submit visibility, hardware Back, PDF/image picking and conversion, per-file retry, UPI Intent launch/no-app/return, uncertain verification recovery after restart, server-paid pickup-code gating, local event mute, notification-channel mute and DND, and duplicate socket/API/push delivery. Real provider transactions require a separately authorized payment test environment; browser fixtures cannot validate UPI handoff or OS notification audio.

Browser screenshots under `design/implementation-validation` are explicitly React Native web layout evidence. Physical-device screenshots and logcat evidence are pending until an authorized USB device is detected and the native build passes.

## Physical phone connection — 16 October 2026

Installed the debug APK successfully on the user-authorized Samsung SM-A042F over USB. Explicit ADB reverse maps phone8081/8082 to host8082 and API8083 to host8083. Initial native splash remained visible while development font loading was unresolved. Updated the fixture preview launcher to advertise localhost and resolve localhost to IPv4: the prior localhost attempt bound only ::1, which USB reverse could not reach. Metro now listens on127.0.0.1:8082. After reload, fonts and theme initialization completed and the native OTP screen rendered on the phone. Evidence: `design/implementation-validation/android-device-startup.png` (720×1600). This establishes installation and startup, not full physical flow, UPI or audio validation. The build still depends on the running Metro/fixture and USB reverse; it is not a standalone release.

## Phone feedback refinements — 16 October 2026

The user approved additive profile persistence and chose to retain test data. Backend GET/PATCH /auth/profile and registration now support optional contact_email/date_of_birth; login email, role and credential contracts are unchanged. The local fixture mirrors the same validator and passed a GET/PATCH/read roundtrip; the temporary test details were restored afterward. Production database persistence was not exercised.

Home now has one top-right Notifications action, one bottom Profile destination, API shop cards and recent orders, focus/pull refresh and partial-error recovery. No production sample shop/order records were inserted. Native Dark mode now uses neutral grey surfaces with lighter elevations, softer purple actions and muted green semantic accents. Shared website colours and Light mode are unchanged. Contrast regression tests check body copy across all dark surfaces, action/disabled/status combinations and control/focus contrast. Native tests pass40/40 (including calendar date validity and contact-email validation). Dark design reference: https://www.phonepe.com/blog/design/lighting-up-the-night-presenting-the-dark-theme-of-phonepe/ . The supplied logo image is copied unchanged; the final APK rebuild and device evidence follow below.

Final physical checks passed on Samsung SM-A042F: installed updated ARM64 APK (62,914,814bytes); app restored its test session and rendered updated Home; bell opened Notifications, hardware Back returned Home; both fixture shops and accepted test order appeared in the scrollable Home list. Profile calendar opened; selected test date and typed contact email saved through the phone to the fixture API, then both values reappeared after reopening Account details. Temporary QA values were cleared and the profile refreshed. Switched Light→Dark in Settings and inspected the phone rendering. Dark rush indicators now use small theme-coloured vector dots instead of bright emoji. Native tests40/40 and backend profile tests12/12 pass. Evidence: android-dark-home-refined.png, android-dark-home-orders.png, android-dark-settings-refined.png and android-dob-calendar-dark.png. Build log: D:/Android/printlly-logo-arm64-build.log. Full live-provider/OS audio checks remain outside these profile/theme checks.

## Opening package native resource build — 17 October 2026

`plugins/withNeutralAndroidSplash.cjs` supplies a transparent vector for Android's required launch drawable. Register this plugin before `expo-splash-screen`; dangerous mods run in reverse registration order, so Expo's image cleanup must finish before the vector is emitted. The supplied folded emblem remains the launcher icon. A disposable resource-tree integration check against the installed Expo splash plugin confirmed that the neutral drawable survives its cleanup.

The no-image Expo57 splash configuration originally left a missing `drawable/splashscreen_logo` reference. The tracked plugin resolves that reproducibly. `npx expo prebuild --platform android --no-install` completed, although Expo regenerated the existing native directory during that invocation. The ARM64 debug build then passed in 9m47s, 274 tasks (246 executed, 28 up-to-date). APK is `userapp/android/app/build/outputs/apk/debug/app-debug.apk`, 62,040,126 bytes. Log: `D:/Android/printlly-opening-arm64-build.log`. Build command was the existing command above with `CMAKE_BUILD_PARALLEL_LEVEL=2` and `-PreactNativeArchitectures=arm64-v8a` added. This compilation result does not itself establish device animation rendering.

OpeningArtwork resets its clocks and completion flag per effect setup, and fences callbacks belonging to disposed effects. Single-pass completion, background cancellation, input dismissal and reduced-motion immediate entry remain intact.
