import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// Pure helpers have no native imports, so the native checks run without a simulator.
async function sourceModule(relative) {
  const source = await readFile(path.join(root, relative), "utf8");
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
}
const { validateCustomerAuth, assertCustomerSession } = await sourceModule(
  "src/utils/authValidation.js",
);
const valid = {
  name: "Customer",
  phone: "9000000000",
  email: "customer@example.test",
  password: "correct passphrase",
};
assert.equal(validateCustomerAuth(valid, true), "");
assert.equal(
  validateCustomerAuth({ ...valid, password: "existing" }, false),
  "",
);
assert.match(
  validateCustomerAuth({ ...valid, email: "invalid" }, false),
  /email/,
);
assert.match(validateCustomerAuth({ ...valid, name: " " }, true), /name/);
assert.match(
  validateCustomerAuth({ ...valid, password: "short" }, true),
  /10 characters/,
);
assert.match(
  validateCustomerAuth({ ...valid, password: " leading space" }, true),
  /space/,
);
assert.throws(
  () => assertCustomerSession({ token: "test", user: { role: "shop_owner" } }),
  /partner website/,
);
assert.throws(
  () => assertCustomerSession({ user: { role: "customer" } }),
  /complete sign-in/,
);
assert.doesNotThrow(() =>
  assertCustomerSession({ token: "test", user: { role: "customer" } }),
);

const { colors, statusColors, availabilityColors } = await sourceModule(
  "src/theme/colors.js",
);
const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const ratio = (a, b) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
for (const [name, fg, bg] of [
  ["primary button", colors.onPrimary, colors.primary],
  ["secondary text", colors.textSecondary, colors.background],
  ["muted text", colors.textMuted, colors.background],
  ...Object.entries(statusColors).map(([key, value]) => [
    key,
    value.text,
    value.bg,
  ]),
  ...Object.entries(availabilityColors).map(([key, value]) => [
    key,
    value.text,
    value.bg,
  ]),
])
  assert.ok(ratio(fg, bg) >= 4.5, `${name} must meet 4.5:1 text contrast`);

const config = JSON.parse(
  await readFile(path.join(root, "app.json"), "utf8"),
).expo;
assert.equal(config.name, "Paprout");
for (const asset of [
  config.icon,
  config.android.adaptiveIcon.foregroundImage,
  config.android.adaptiveIcon.monochromeImage,
  config.web.favicon,
])
  await access(path.join(root, asset));
for (const art of ["pickup", "student", "paper-pal"])
  await access(path.join(root, `assets/art/${art}-cmyk.png`));
console.log(
  "Passed: customer auth validation/role guards, theme contrast, app identity and referenced assets.",
);
