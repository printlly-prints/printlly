// Canonical human portraits on Figma page 15. PaperPal and the admin portrait
// are role artwork, so they never enter the customer-choice catalogue.
export const CUSTOMER_AVATAR_IDS = [
  "01-user-customer", "02-student", "03-vendor", "05-support",
  "06-avatar", "07-avatar", "08-avatar", "09-avatar", "10-avatar", "11-avatar",
  "12-avatar", "13-avatar", "14-avatar", "15-avatar", "16-avatar", "17-avatar",
];
export const DEFAULT_AVATAR_ID = "06-avatar";
export function customerAvatarId(value) {
  return CUSTOMER_AVATAR_IDS.includes(value) ? value : DEFAULT_AVATAR_ID;
}
