import defaultTheme from "tailwindcss/defaultTheme";
const color = (name) => `rgb(var(--rgb-${name}) / <alpha-value>)`;

/** Shared Figma semantics are applied by ThemeProvider in both appearance modes. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: color("canvas"), "background-page": color("canvas"), "background-soft": color("subtle"), "background-tint": color("subtle"),
        surface: color("surface"), "surface-raised": color("surfaceRaised"), input: color("surface"), "surface-deep": "#19121F",
        primary: color("action"), "primary-deep": color("actionPressed"), "primary-bright": color("action"), "primary-accent": color("action"), "primary-wash": color("selection"),
        "text-primary": color("textPrimary"), "text-secondary": color("textSecondary"), "text-muted": color("textMuted"), border: color("divider"), "border-strong": color("controlBorder"),
        leaf: color("accentLime"), "leaf-natural": color("accentLime"), "leaf-soft": color("accentLime"),
        success: color("success"), "success-bg": color("successSurface"), "success-text": color("success"), "success-border": color("controlBorder"),
        error: color("error"), "error-bg": color("errorSurface"), "error-text": color("error"), "error-border": color("error"),
        busy: color("accentApricot"), "busy-bg": color("subtle"), "busy-text": color("textPrimary"), "busy-border": color("controlBorder"),
        shut: color("error"), "shut-bg": color("errorSurface"), "shut-text": color("error"), "shut-border": color("error"),
        "status-pending-bg": color("subtle"), "status-pending-text": color("textPrimary"), "status-pending-border": color("controlBorder"),
        "status-active-bg": color("infoSurface"), "status-active-text": color("info"), "status-active-border": color("controlBorder"),
        "status-ready-bg": color("successSurface"), "status-ready-text": color("success"), "status-ready-border": color("controlBorder"),
        "status-done-bg": color("subtle"), "status-done-text": color("textSecondary"), "status-done-border": color("divider"),
      },
      borderColor: { DEFAULT: color("divider") }, divideColor: { DEFAULT: color("divider") },
      fontFamily: { sans: ["Inter", ...defaultTheme.fontFamily.sans], heading: ["Manrope", ...defaultTheme.fontFamily.sans], hand: ["Manrope", ...defaultTheme.fontFamily.sans] },
      borderRadius: { control: "12px", card: "20px", panel: "24px", hero: "24px", modal: "24px" },
      boxShadow: { card: "0 2px 8px rgb(44 24 56 / .06)", "card-hover": "0 4px 16px rgb(44 24 56 / .12)", cta: "none", "cta-hover": "none", dropdown: "0 8px 32px rgb(25 18 31 / .18)", modal: "0 16px 64px rgb(25 18 31 / .24)", nav: "0 1px 0 rgb(var(--rgb-divider) / 1)" },
    },
  },
  plugins: [],
};
