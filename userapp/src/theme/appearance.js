export const APPEARANCE_MODES = ["system", "light", "dark"];

export function resolveAppearance(preference, systemScheme) {
  return preference === "light" || preference === "dark"
    ? preference
    : systemScheme === "dark" ? "dark" : "light";
}

export function validAppearance(value) {
  return APPEARANCE_MODES.includes(value) ? value : "system";
}

// User-requested mobile contrast refinement; retain the original shared Figma
// values for the website and Light mode.
export const MOBILE_DARK_COLORS = {
  canvas: "#202129", surface: "#30313D", surfaceRaised: "#414351",
  selection: "#484054", subtle: "#373945", hero: "#413B50",
  textPrimary: "#F4F1FA", textSecondary: "#D6D2E0", textMuted: "#C1BACD",
  action: "#CBB7F6", actionPressed: "#B49BE5", actionDisabled: "#444451",
  onAction: "#292037", onAccent: "#202129", onSelection: "#E1D2FF",
  controlBorder: "#A29BAE", border: "#8C8799", divider: "#696674", focus: "#D5BFFF",
  accentLime: "#AAC7AF", accentApricot: "#E2B39C", lavender: "#414351",
  error: "#FFB5BD", errorSurface: "#51333F", success: "#A2D5B7", successSurface: "#2F433B",
  info: "#D1B9FA", infoSurface: "#484054", chatOutgoing: "#CBB7F6", chatIncoming: "#30313D",
};

export function nativeColorAliases(source, mode) {
  source = mode === "dark" ? { ...source, ...MOBILE_DARK_COLORS } : source;
  return {
    ...source,
    background: source.canvas,
    backgroundSoft: source.subtle,
    backgroundTint: source.canvas,
    primary: source.action,
    primaryDeep: source.actionPressed,
    primaryAccent: source.action,
    primaryWash: source.selection,
    primaryBright: source.action,
    borderStrong: source.controlBorder,
    leaf: source.accentLime,
    leafSoft: source.subtle,
    successBg: source.successSurface,
    successText: source.success,
    danger: source.error,
    dangerBg: source.errorSurface,
    dangerText: source.error,
  };
}
