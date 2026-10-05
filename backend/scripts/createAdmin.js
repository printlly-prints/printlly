/**
 * scripts/createAdmin.js
 *
 * The ONLY way an admin account comes into existence.
 *
 *   node scripts/createAdmin.js
 *
 * There is deliberately no self-serve path: POST /auth/register whitelists
 * role to "shop_owner"/"customer" and silently downgrades anything else
 * (see authController.js), so "role": "admin" in a signup body creates a
 * customer, not an admin. That whitelist is the guard; this script is the
 * sanctioned way around it, and it only runs with direct access to the
 * server's .env and database.
 *
 * Prompts for name, email and password, hashes the password with bcrypt at
 * the same cost factor as the normal local signup flow, and writes a User
 * with role "admin". That account then logs in through the ordinary
 * POST /auth/login - there is no separate admin login route, and no
 * separate credential store.
 */

require("dotenv").config();
const readline = require("readline");
const { Writable } = require("stream");
const bcrypt = require("bcryptjs");
const { validatePassword } = require("../utils/passwordPolicy");
const mongoose = require("mongoose");
const User = require("../models/User");

// Matches the cost factor authController.js uses for ordinary signups, so
// an admin password is hashed no differently from anyone else's.
const BCRYPT_ROUNDS = 10;

// A writable stdout proxy that can be told to stop echoing. Used for the
// password prompt so the typed characters don't sit in the terminal (and
// in scrollback) in plain text.
const mutableStdout = new Writable({
  write(chunk, encoding, callback) {
    if (!mutableStdout.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  },
});
mutableStdout.muted = false;

// terminal mode is what makes password masking possible, but it also
// makes readline echo and re-buffer piped input, which breaks when this
// script is driven non-interactively (a test harness, or `printf ... |
// node scripts/createAdmin.js`). Following stdin's own TTY-ness gives
// masking when a human is typing and plain line reads when something
// else is feeding it.
const isInteractive = Boolean(process.stdin.isTTY);

// Interactive path: a real readline over the mutable stdout above, which
// is what allows the password prompts to stop echoing.
const rl = isInteractive
  ? readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true })
  : null;

// Non-interactive path: readline's terminal mode re-buffers and echoes
// piped input, so when stdin isn't a TTY the answers are read as plain
// lines up front instead. This exists so the script can be exercised
// non-interactively (`printf '...' | node scripts/createAdmin.js`); a
// human running it normally always takes the branch above.
let pipedLines = null;
let pipedIndex = 0;

function readPipedStdin() {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
    });
    process.stdin.on("end", () => resolve(buffer.split(/\r?\n/)));
  });
}

function ask(question) {
  if (!isInteractive) {
    process.stdout.write(question + "\n");
    return Promise.resolve((pipedLines[pipedIndex++] || "").trim());
  }
  return new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

// Same prompt, with echo suppressed while typing. The question itself is
// written directly to stdout first, because muting has to be in effect
// before readline echoes anything the user types.
function askHidden(question) {
  // Nothing is echoing in the first place without a TTY, so there is
  // nothing to mask - fall back to the plain read.
  if (!isInteractive) return ask(question);

  return new Promise((resolve) => {
    process.stdout.write(question);
    mutableStdout.muted = true;
    rl.question("", (answer) => {
      mutableStdout.muted = false;
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

// Deliberately loose: the point is to catch a typo like a missing "@",
// not to adjudicate what is technically a valid address. The database's
// unique index is what actually guarantees no duplicates.
function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Run this from the project root with a configured .env.");
    process.exit(1);
  }

  // Drain piped stdin before the first prompt - the non-interactive path
  // answers from these lines rather than waiting on readline.
  if (!isInteractive) {
    pipedLines = await readPipedStdin();
  }

  console.log("\nCreate an admin user for the Printlly admin panel.\n");

  const name = await ask("Full name: ");
  if (!name) {
    console.error("\nName is required.");
    process.exit(1);
  }

  const email = (await ask("Email: ")).toLowerCase();
  if (!looksLikeEmail(email)) {
    console.error("\nThat doesn't look like a valid email address.");
    process.exit(1);
  }

  const password = await askHidden("Password: ");
  // The same policy the API enforces (utils/passwordPolicy.js), rather than
  // the local "at least 8" this used to carry. An admin account is the most
  // privileged thing on the platform; it would be an odd place to hold to a
  // weaker rule than a customer signing up.
  const policy = validatePassword(password);
  if (!policy.valid) {
    console.error(`\n${policy.message}\n`);
    process.exit(1);
  }

  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) {
    console.error("\nPasswords do not match.");
    process.exit(1);
  }

  if (rl) rl.close();

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // Checked explicitly for a clear message, though the unique index on
    // email is what actually prevents a duplicate under a race.
    const existing = await User.findOne({ email });
    if (existing) {
      console.error(
        `\nA user with ${email} already exists (role: ${existing.role}). ` +
          "Use a different address, or promote that account directly in the database if it should be an admin."
      );
      process.exitCode = 1;
      return;
    }

    const password_hash = await bcrypt.hash(password, await bcrypt.genSalt(BCRYPT_ROUNDS));

    // No phone: the User schema only requires one for non-Google accounts
    // via a `required` function, and admins have no use for it - but that
    // function does apply here, so it is set explicitly to nothing and the
    // field left absent. `phone` is sparse+unique, so many admins with no
    // phone coexist fine.
    const admin = await User.create({
      name,
      email,
      password_hash,
      role: "admin",
    });

    console.log(`\nAdmin created: ${admin.email} (id ${admin._id})`);
    console.log("Sign in at the admin panel with this email and password.\n");
  } catch (error) {
    // A validation error here most likely means the User schema requires
    // something this script doesn't collect - worth showing verbatim
    // rather than a generic failure.
    console.error(`\nFailed to create admin: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`\nUnexpected error: ${error.message}\n`);
  process.exit(1);
});
