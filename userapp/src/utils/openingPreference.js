export const OPENING_PREFERENCE_KEY = 'printlly:opening:enabled';

// Existing installations opt in unless this device explicitly disabled entry motion.
export function readOpeningPreference(stored) {
  return stored !== 'false';
}
