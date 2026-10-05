// The one place a password is judged. Every path that accepts a new
// password - registration, password change, scripts/createAdmin.js - calls
// validatePassword, so the rule cannot be stricter in one entry point than
// another, and raising the minimum later is a one-line change rather than a
// hunt through controllers.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// No "one uppercase, one digit, one symbol" rule. Composition rules push
// people towards Passw0rd! - a password that satisfies every box and is in
// every cracking dictionary - while rejecting "correct horse battery
// staple", which is enormously stronger. Current guidance (NIST SP 800-63B)
// is to drop composition rules and lean on length, which is what this does.
//
// Length is checked in BYTES, not characters, and the maximum is 72 for a
// concrete reason: bcrypt only reads the first 72 bytes of its input and
// silently ignores the rest. A longer maximum would be a lie - two
// passphrases differing only after byte 72 would be the same password as far
// as authentication is concerned, and someone who had typed 100 characters
// would reasonably believe all 100 counted. Rejecting the input is honest;
// truncating it quietly is not. 72 bytes is still a 72-character ASCII
// passphrase, which is far more room than any real user needs.
//
// The byte limit also closes the resource-exhaustion angle: an attacker
// cannot post a multi-megabyte password and make the server hash it, because
// the length check runs before bcrypt is ever called.

const MIN_PASSWORD_LENGTH = 10;
// bcrypt's own hard limit - see above. Not an arbitrary choice.
const MAX_PASSWORD_BYTES = 72;

// Returns { valid: true } or { valid: false, message } with a message that is
// safe to show a user: it says what is wrong with the password they typed and
// nothing about any account.
function validatePassword(password) {
  if (typeof password !== "string") {
    return { valid: false, message: "Password is required" };
  }

  if (password.length === 0) {
    return { valid: false, message: "Password is required" };
  }

  // A password of nothing but spaces is almost certainly a mistake - a
  // placeholder, or an autofill that went wrong - and it is indistinguishable
  // from one to the person who then cannot sign in.
  if (password.trim().length === 0) {
    return { valid: false, message: "Password cannot be only spaces" };
  }

  // Rejected rather than trimmed. Trimming would store a different password
  // from the one the person typed, so when they later type it again
  // (including the space they meant to include) it would fail, with nothing
  // to explain why. Telling them now is kinder than silently changing it.
  if (password !== password.trim()) {
    return {
      valid: false,
      message: "Password cannot start or end with a space",
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  // Byte length, because that is what bcrypt counts. An emoji or an accented
  // character is several bytes, so a 40-character password can exceed this.
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return {
      valid: false,
      message: `Password is too long (maximum ${MAX_PASSWORD_BYTES} bytes - about ${MAX_PASSWORD_BYTES} characters)`,
    };
  }

  return { valid: true };
}

module.exports = {
  validatePassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
};
