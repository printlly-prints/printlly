import assert from "node:assert/strict";
import test from "node:test";
import { nativeColorAliases, resolveAppearance, validAppearance } from "../src/theme/appearance.js";
import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync(new URL("../../shared/design-tokens.json", import.meta.url)));

test("System follows OS while explicit appearance remains stable", () => {
  assert.equal(resolveAppearance("system", "dark"), "dark");
  assert.equal(resolveAppearance("system", "light"), "light");
  assert.equal(resolveAppearance("system", null), "light");
  assert.equal(resolveAppearance("light", "dark"), "light");
  assert.equal(resolveAppearance("dark", "light"), "dark");
  for (const value of [null, undefined, "automatic", "unexpected"]) assert.equal(validAppearance(value), "system");
});

test("Native aliases preserve exact decoded Figma modes and action foregrounds", () => {
  for (const mode of ["light", "dark"]) {
    const palette = nativeColorAliases(tokens.colors[mode]);
    assert.equal(palette.background, tokens.colors[mode].canvas);
    assert.equal(palette.primary, tokens.colors[mode].action);
    assert.equal(palette.onAction, tokens.colors[mode].onAction);
    assert.equal(palette.borderStrong, tokens.colors[mode].controlBorder);
  }
});

const luminance = (hex) => {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
test("mobile dark text and controls retain readable contrast across elevated surfaces", () => {
  const p = nativeColorAliases(tokens.colors.dark, "dark");
  for (const surface of ["canvas", "surface", "surfaceRaised", "selection", "hero", "subtle"]) {
    for (const text of ["textPrimary", "textSecondary", "textMuted"]) assert.ok(contrast(p[text], p[surface]) >= 4.5, `${text}/${surface}`);
  }
  for (const [text, surface] of [["onAction", "action"], ["onAction", "actionPressed"], ["textMuted", "actionDisabled"], ["success", "successSurface"], ["error", "errorSurface"], ["info", "infoSurface"]]) assert.ok(contrast(p[text], p[surface]) >= 4.5, `${text}/${surface}`);
  assert.ok(contrast(p.controlBorder, p.surface) >= 3);
  assert.ok(contrast(p.focus, p.canvas) >= 3);
  assert.deepEqual(nativeColorAliases(tokens.colors.light, "light"), nativeColorAliases(tokens.colors.light));
});
