# Local bundled Android QA build

This is a local performance build, signed with the existing Android debug
keystore. It embeds the production-mode Hermes bundle and assets so startup
does not depend on Metro. It is not a store distribution build.

Build environment explicitly selects `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8083`
and an empty `EXPO_PUBLIC_POSTHOG_KEY`. It uses the isolated local test fixture.
The normal production authentication restriction remains active (`__DEV__` is
false); replacing the existing app preserves its stored local-test session.

For USB fixture access, this checkout's **ignored generated native project** has
two local-only files:

- `android/app/src/release/AndroidManifest.xml` sets a network security config.
- `android/app/src/release/res/xml/local_qa_network_security_config.xml` rejects
  cleartext by default and permits only `127.0.0.1` without subdomains.

The tracked Expo configuration and main Android manifest do not enable global
cleartext. These variant overrides must not be carried into a store release.
The phone needs USB port forwarding for fixture port 8083, but not Metro port
8081/8082. No payment gateway or real money is involved.

Native fonts are configured through the tracked `expo-font` plugin. To update
an existing native checkout without a clean prebuild, run
`node qa/embed-native-fonts.cjs` from `userapp`.

The ARM64 build command, after setting the documented local Java/SDK environment,
is `gradlew.bat :app:assembleRelease --console=plain --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a`.
