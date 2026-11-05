import tokens from "../../../shared/design-tokens.json";
export const fonts = { headingSemiBold: "Manrope_600SemiBold", headingBold: "Manrope_700Bold", headingExtraBold: "Manrope_800ExtraBold", bodyRegular: "Inter_400Regular", bodyMedium: "Inter_500Medium" };
const role = (name, fontFamily) => ({ fontFamily, fontSize: tokens.type[name].size, lineHeight: tokens.type[name].lineHeight });
export const typography = {
  display: role("heading-lg", fonts.headingBold), h1: { fontFamily: fonts.headingBold, fontSize: 28, lineHeight: 34 },
  h2: role("heading-sm", fonts.headingBold), h3: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 28 },
  body: role("body", fonts.bodyRegular), bodyMedium: role("body", fonts.bodyMedium), bodySmall: role("small", fonts.bodyRegular),
  caption: role("caption", fonts.bodyRegular), label: role("small", fonts.bodyMedium), labelSmall: role("caption", fonts.bodyMedium),
  button: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 22 },
};
