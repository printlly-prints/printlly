// Business and legal identity, in one place.
//
// ===================================================================
// PLACEHOLDERS - REPLACE BEFORE PUBLISHING THESE PAGES.
// Paprout has no registered entity details anywhere in this codebase:
// no legal name, no GSTIN, no registered address, no support inbox that
// a real person reads. None of it is invented here. Every value below
// falls back to an obvious placeholder, and the pages render a visible
// banner while that is the case, because a confident wrong address on a
// grievance page is worse than an obviously missing one - a customer who
// writes to a made-up inbox gets silence instead of an error.
// Fill these in via vendor-website/.env (see .env.example) before launch.
// ===================================================================
//
// Read through import.meta.env rather than hardcoded, matching how the
// mobile app handles the same problem (userapp/src/config/support.js) and so
// the details can change without a code change.

const env = import.meta.env;

// A value is "configured" only if the environment actually supplies it.
// The fallbacks are deliberately unusable - .example domains and zeroed
// numbers - so that a placeholder can never be mistaken for real.
export const LEGAL_BUSINESS_NAME = env.VITE_LEGAL_BUSINESS_NAME || "[LEGAL BUSINESS NAME]";
export const REGISTERED_ADDRESS = env.VITE_REGISTERED_ADDRESS || "[REGISTERED ADDRESS]";
export const GSTIN = env.VITE_GSTIN || "[GSTIN]";
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL || "[SUPPORT EMAIL]";
export const SUPPORT_PHONE = env.VITE_SUPPORT_PHONE || "[SUPPORT PHONE]";
export const GRIEVANCE_EMAIL = env.VITE_GRIEVANCE_EMAIL || SUPPORT_EMAIL;
export const LEGAL_EMAIL = env.VITE_LEGAL_EMAIL || SUPPORT_EMAIL;
// Stated rather than implied - support hours are not a promise the
// platform can keep outside them.
export const SUPPORT_HOURS = env.VITE_SUPPORT_HOURS || "[SUPPORT HOURS]";
export const GOVERNING_STATE = env.VITE_GOVERNING_STATE || "[STATE]";

// Whether the entity details have been filled in at all. The legal pages
// use this to show an unmissable "not yet configured" notice instead of
// presenting placeholders as though they were real contact details.
export const LEGAL_DETAILS_CONFIGURED = Boolean(
  env.VITE_LEGAL_BUSINESS_NAME && env.VITE_REGISTERED_ADDRESS && env.VITE_SUPPORT_EMAIL
);

// One date for every policy page, so they cannot drift apart and claim
// to have been revised at different times when they were written
// together. Update it when the text changes, not on every deploy.
export const POLICY_LAST_UPDATED = "4 October 2026";

// Operational facts quoted by the policies. Each one mirrors a real
// constant in the backend, and is listed here so a policy and the code
// cannot silently disagree. If any of these change in the backend, these
// strings must change with them.
export const FACTS = {
  // cron/cleanupAbandonedOrders.js
  unpaidOrderExpiryHours: 1,
  // cron/cleanupAbandonedOrders.js
  acceptedOrderExpiryHours: 48,
  // UPLOAD_ORPHAN_RETENTION_HOURS in .env (default 24)
  orphanUploadRetentionHours: 24,
  // routes/uploadRoutes.js
  maxFilesPerUpload: 10,
  maxFileSizeMb: 10,
  // utils/otp.js
  otpDigits: 6,
};
