// Spacing scale (4px base) and corner radii. Padding, margin and gap
// values come from here so they stay consistent across screens rather
// than being picked ad hoc.
//
// There is deliberately no 20px step between lg and xl: an extra option
// that close to its neighbours just gets chosen at random, which is the
// inconsistency the scale exists to prevent.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  section: 48,
  sectionLg: 64,
  sectionXl: 80,
};

// Corner radii. Softer than a stock scale - cards and sheets carry real
// roundness, controls stay tighter. Pills are reserved for badges,
// filter chips and tags; nothing else should be fully rounded.
export const radius = {
  sm: 10, // chips, small controls, inline inputs
  md: 14, // cards
  lg: 18, // large cards, grouped lists, tappable option tiles
  hero: 22, // hero cards, OTP card
  modal: 20, // sheets and modals
  button: 12, // buttons stay tighter than the cards they sit in
  pill: 999, // status badges, filter chips, tags only
};

// Elevation. Structure comes from the 1px border - the shadow only
// separates a surface from what is behind it, and never on its own.
//
// DARK THEME: the colour is now near-black rather than the old teal-grey
// (#102A2E), and the opacities roughly tripled.
//
// A soft, barely-there shadow is how you lift a white card off a pale page.
// It does almost nothing on dark, because a 5%-opacity dark shadow cast onto
// an already-dark ground is very nearly the same colour as the ground. So the
// shadow is deepened to stay perceptible, and - more importantly - the real
// work of separating surfaces moved to the explicit elevation ladder in
// theme/colors.js (background -> surface -> surfaceRaised) and to the
// stronger border. That is the "increase contrast or thickness rather than
// change colour" instruction applied to depth.
export const shadows = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sheet: {
    shadowColor: "#000000",
    shadowOpacity: 0.38,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
};
