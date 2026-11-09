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
const { shopMaps, isGoogleMapsUrl, googleMapHtml } = await sourceModule(
  "src/utils/shopMaps.js",
);
assert.equal(googleMapHtml("https://evil.test/"), "");
assert(
  googleMapHtml("https://www.google.com/maps?output=embed&q=0,0").includes(
    "<iframe",
  ),
);
assert(
  googleMapHtml("https://www.google.com/maps?output=embed&q=0,0").includes(
    "&amp;q=",
  ),
);
assert.equal(isGoogleMapsUrl("https://maps.app.goo.gl/abc"), true);
for (const url of [
  "https://evil.test/maps",
  "https://www.google.com.evil.test/maps",
  "http://www.google.com/maps",
  "https://user@www.google.com/maps",
])
  assert.equal(isGoogleMapsUrl(url), false);
const googlePin = shopMaps({
  location: { coordinates: [77.9346697, 30.3266703] },
  google_maps_url: "https://www.google.com/maps?cid=3101541793969883219",
});
assert.equal(
  googlePin.url,
  "https://www.google.com/maps?cid=3101541793969883219",
);
assert(googlePin.embed.includes("30.3266703%2C77.9346697"));
assert(shopMaps({ location: { coordinates: [0, 0] } }).embed.includes("0%2C0"));
assert.equal(shopMaps({ location: { coordinates: [181, 0] } }).embed, null);
assert.equal(
  shopMaps({ google_maps_embed_url: "https://evil.test/" }).embed,
  null,
);
assert.equal(
  shopMaps({
    google_maps_embed_url: "https://www.google.com/maps/embed?pb=pin",
  }).embed,
  "https://www.google.com/maps/embed?pb=pin",
);
const { validateProfilePreferences, profilePreferencesKey } =
  await sourceModule("src/utils/profilePreferences.js");
const profile = {
  name: "Alex",
  avatar: "paper-pal",
  printDefaults: {
    color_mode: "bw",
    paper_size: "A4",
    sides: "single",
    copies: 1,
  },
};
assert.equal(validateProfilePreferences(profile), "");
assert.match(validateProfilePreferences({ ...profile, name: "   " }), /name/);
assert.match(
  validateProfilePreferences({ ...profile, avatar: "../photo" }),
  /character/,
);
assert.match(
  validateProfilePreferences({
    ...profile,
    printDefaults: { ...profile.printDefaults, copies: 0 },
  }),
  /preferences/,
);
assert.notEqual(
  profilePreferencesKey("customer-a"),
  profilePreferencesKey("customer-b"),
);
const { selectedQuote } = await sourceModule("src/utils/quoteSelection.js");
const available = {
  shop_id: "open",
  is_currently_open: true,
  total_amount: 19,
};
const closed = {
  shop_id: "closed",
  is_currently_open: false,
  total_amount: 12,
};
assert.equal(selectedQuote([closed, available], null), available);
assert.equal(selectedQuote([closed, available], "closed"), null);
assert.equal(selectedQuote([closed, available], "missing"), null);
assert.equal(selectedQuote([closed, available], "open"), available);
const { orderJourney } = await sourceModule("src/utils/orderJourney.js");
assert.equal(orderJourney("pending").stage, -1);
assert.equal(orderJourney("accepted").art, "printing");
assert.equal(orderJourney("ready_for_pickup").stage, 2);
assert.equal(
  validateProfilePreferences({ ...profile, avatar: "avatar-17" }),
  "",
);
assert.match(
  validateProfilePreferences({ ...profile, avatar: "avatar-00" }),
  /character/,
);
for (let n = 1; n <= 17; n++)
  await access(
    path.join(root, `assets/avatars/avatar-${String(n).padStart(2, "0")}.png`),
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
for (const pose of ["offline", "empty", "success", "pending"])
  await access(path.join(root, `assets/art/paper-pal-${pose}.png`));
await access(path.join(root, "assets/art/customer-avatar-cmyk.png"));
console.log(
  "Passed: customer auth validation/role guards, theme contrast, app identity and referenced assets.",
);
