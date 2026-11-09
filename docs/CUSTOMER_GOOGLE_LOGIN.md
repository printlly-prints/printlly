# Customer Google sign-in

Email sign-in remains the available local flow. The Google button stays disabled in Expo Go and when the Web client ID is unset. No mock Google identity or account is accepted.

When preparing a native build:

1. Configure the Android package name in app.json, then register that package and the build certificate SHA-1 with Google Cloud. Create a Web OAuth client for backend ID-token verification.
2. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in userapp/.env.local and the same value as GOOGLE_CUSTOMER_WEB_CLIENT_ID in backend/.env. These are client IDs, not client secrets.
3. For iOS, register its bundle ID and set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. app.config.js configures the reversed client-ID URL scheme.
4. Build a native development/release app with the Google sign-in module. Expo Go does not contain that native module. Restart the backend after changing its environment and rebuild/reload the app configuration as appropriate.

The native SDK requests a Google ID token. POST /auth/google/customer verifies its signature, issuer, expiry and configured audience through Google's official google-auth-library, requires verified email, and issues the existing revocable app session. The endpoint accepts customer accounts only. Existing password accounts keep their passwords; automatic identity linking is restricted to Gmail/Google Workspace addresses. Shop-owner Google browser OAuth remains separate.

Checks: backend/scripts/checkCustomerGoogle.js uses an isolated temporary database and mocked Google verification transport to exercise rejection, linking and session behavior. Actual Google consent and native sign-in require the configured project and native build and are not covered by those checks.

References: [Expo Google authentication](https://docs.expo.dev/guides/google-authentication/), [native SDK setup](https://react-native-google-signin.github.io/docs/setting-up/expo), [Google backend verification](https://developers.google.com/identity/sign-in/web/backend-auth).
