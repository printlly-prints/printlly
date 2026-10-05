// Support contact details, shown on HelpSupportScreen underneath the
// chat.
//
// ===================================================================
// PLACEHOLDERS - REPLACE BEFORE SHIPPING.
// The two EXPO_PUBLIC_SUPPORT_* values in userapp/.env are made-up. Put the
// real support inbox and phone line there (and in .env.example's
// comment) before any build goes to a real customer: a wrong address on
// a support screen reads as a working one, and a customer who writes to
// it gets silence rather than an error.
// ===================================================================
//
// Read through env rather than hardcoded so the details can change
// without a code change, and so a build can point at a staging inbox.
// Expo inlines anything prefixed EXPO_PUBLIC_ at build time, which also
// means these are only picked up when the packager starts - changing
// .env needs a restart, not a reload.
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@printlly.example";
export const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || "+91 00000 00000";

// Shown next to the phone number. Not a promise the platform can keep
// outside these hours, so it is stated rather than left implied.
export const SUPPORT_HOURS = process.env.EXPO_PUBLIC_SUPPORT_HOURS || "10 AM - 7 PM, Mon to Sat";

// True only once someone has actually filled the values in. The screen
// uses this to label the block as placeholder rather than presenting
// invented contact details as real - the one thing worse than no
// support number is a confident wrong one.
export const SUPPORT_CONTACT_CONFIGURED = Boolean(
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL && process.env.EXPO_PUBLIC_SUPPORT_PHONE
);
