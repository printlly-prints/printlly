// The mobile app's login is currently a placeholder phone + OTP flow (see
// PhoneEntryScreen / OtpScreen) for demoing the app before a real SMS OTP
// provider is wired up. The backend has no concept of OTP login though -
// every real endpoint (GET /shops, POST /orders, ...) still requires a
// normal email/password JWT. So instead of asking the user to set a
// password, we derive a stand-in email + password from their phone
// number and use the existing register/login endpoints underneath.
//
// IMPORTANT - NOT SECURE, NOT FOR PRODUCTION: the password is computed
// from the phone number alone, so anyone who knows a user's phone number
// can derive the same password and sign in as them. This is acceptable
// only because "the OTP is always 123" already makes this build a demo,
// not a real login system. Replace this whole file plus PhoneEntryScreen/
// OtpScreen with real OTP verification (e.g. Firebase Auth, MSG91) that
// is checked server-side before shipping this app for real.
//
// STRUCTURALLY BLOCKED FROM PRODUCTION - this is not just a warning
// comment any more. Two independent layers keep this flow out of a real
// build, so it doesn't need to be rediscovered by a future audit:
//   1. App.js only registers PhoneEntryScreen/OtpScreen/AccountSetupScreen
//      (this flow's UI) when __DEV__ is true - any other build renders
//      AuthUnavailableScreen instead, so there is no on-screen way to
//      reach this flow at all.
//   2. toDemoCredentials below - the one function this whole flow
//      actually depends on - refuses to run at all when __DEV__ is
//      false, even if something still calls it directly (a stale route,
//      a future refactor that re-adds a call site, etc). Layer 1 hides
//      the door; this is the lock on the other side of it in case layer
//      1 is ever bypassed or forgotten.
//
// __DEV__ is Expo/React Native's built-in global - true only when running
// via `expo start`/a dev client, false in every built binary (dev,
// preview, or production EAS profile alike). This project has no
// eas.json / build-profile env vars yet to distinguish preview from
// production more precisely - if one is added later, swap the check
// below for that instead so a preview build can still use this flow
// without also being __DEV__.
const DEMO_LOGIN_AVAILABLE = __DEV__;

const DEMO_PASSWORD_PREFIX = "Demo@Print#";

export function toDemoCredentials(phone) {
  // Layer 2 of the production block described above - refuses to derive
  // (and therefore refuses to let anything log in with) a demo password,
  // regardless of how this function was reached.
  if (!DEMO_LOGIN_AVAILABLE) {
    throw new Error(
      "Demo phone login is disabled in this build. It only exists for internal development/testing."
    );
  }

  return {
    email: `customer${phone}@printmarketplace.demo`,
    password: `${DEMO_PASSWORD_PREFIX}${phone}`,
  };
}
