import tokens from "../../../shared/design-tokens.json";
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40, section: 48, sectionLg: 64, sectionXl: 80 };
export const radius = { sm: tokens.radius.button, md: tokens.radius.default, lg: tokens.radius.large, hero: tokens.radius.large, modal: tokens.radius.large, button: tokens.radius.button, control: tokens.radius.control, pill: 999 };
export const shadows = {
  card: { shadowColor: "#2C1838", shadowOpacity: 0.08, shadowRadius: 0, shadowOffset: { width: 2, height: 3 }, elevation: 1 },
  sheet: { shadowColor: "#2C1838", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 4 },
};
