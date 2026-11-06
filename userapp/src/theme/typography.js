// Inter across the app: 600/700 for headings, 400/500 for body copy.
// The weights match the approved mobile reference and App.js font loading.
//
// Font family names must match the keys passed to useFonts in App.js
// exactly, or React Native silently falls back to the system font - so
// they live here as constants rather than being retyped as string
// literals in screen styles.
export const fonts = {
  headingSemiBold: "Inter_600SemiBold",
  headingBold: "Inter_700Bold",
  headingExtraBold: "Inter_700Bold",
  bodyRegular: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
};

// Compose with a colour from theme/colors.js separately - these tokens
// intentionally don't hardcode text colour.
export const typography = {
  production: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1.5,
  },
  // Headings - Manrope. Negative tracking on the larger sizes
  // keeps big headlines from looking loose.
  display: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
  }, // OTP, large amounts
  h1: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 30,
    lineHeight: 37,
    letterSpacing: -0.7,
  }, // screen titles
  h2: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  }, // shop/order names
  h3: {
    fontFamily: fonts.headingBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
  }, // section headers, card titles

  // Body - Inter
  body: { fontFamily: fonts.bodyRegular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24 },
  bodySmall: { fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 21 },
  caption: { fontFamily: fonts.bodyRegular, fontSize: 12.5, lineHeight: 18 },

  // Labels - Inter Medium
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20 },
  labelSmall: { fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 18 },

  // Buttons - heading face, to match the weight of the headings above
  button: { fontFamily: fonts.headingBold, fontSize: 16, lineHeight: 21 },
};
