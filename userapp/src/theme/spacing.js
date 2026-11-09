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
// roundness, small controls stay tighter. Full pills
// are reserved for badges, filter chips and tags.
export const radius = {
  sm: 8, // chips, small controls, inline inputs
  md: 10, // compact surfaces
  lg: 12, // large surfaces
  hero: 12,
  modal: 24, // sheets and modals
  button: 14,
  card: 22,
  navigation: 36,
  pill: 999, // status badges, filter chips, tags only
};

// Quiet elevation; borders carry the surface hierarchy on paper.
export const shadows = {
  card: {
    shadowColor: "#242426",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sheet: {
    shadowColor: "#242426",
    shadowOpacity: 0.08,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
};
