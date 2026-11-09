// Paprout: warm paper, rich ink, readable cyan actions and print-ink accents.
export const colors = {
  background: "#FAFAF7",
  backgroundSoft: "#F2F2ED",
  backgroundTint: "#EDF4F4",
  surface: "#FFFFFF",
  surfaceRaised: "#F5F7F6",
  primary: "#007C9C",
  primaryDeep: "#00637D",
  primaryAccent: "#00C2FF",
  primaryWash: "#E2F0F2",
  primaryBright: "#00738F",
  onPrimary: "#FFFFFF",
  textPrimary: "#242426",
  textSecondary: "#616164",
  textMuted: "#6F7074",
  border: "#E1E2DD",
  borderStrong: "#B7C8CB",
  yellow: "#F2D85B",
  magenta: "#FF2D8D",
  pinkWash: "#F9EAF0",
  ink: "#1A1A1A",
  // Compatibility aliases for existing tinted settings/icon surfaces.
  leaf: "#007C9C",
  leafSoft: "#F7F3DD",
  success: "#18725C",
  successBg: "#E6F3ED",
  successText: "#17634F",
  danger: "#B43443",
  dangerBg: "#FBEDEF",
  dangerText: "#9B2937",
};
const amber = { bg: "#FBF3D9", text: "#755514", border: "#EBD89C" };
const cyan = { bg: "#E2F0F2", text: "#00637D", border: "#BBD9DF" };
const green = { bg: "#E6F3ED", text: "#17634F", border: "#C1DDCE" };
const neutral = { bg: "#F0F1ED", text: "#565B59", border: "#DADDD6" };
const red = { bg: "#FBEDEF", text: "#9B2937", border: "#EEC6CD" };
export const statusColors = {
  pending: amber,
  accepted: cyan,
  printing: cyan,
  ready_for_pickup: green,
  completed: neutral,
  cancelled: red,
  expired: neutral,
  payment_pending: amber,
  payment_failed: red,
};
export const statusLabels = {
  pending: "Pending",
  accepted: "Accepted",
  printing: "Printing",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  payment_pending: "Payment pending",
  payment_failed: "Payment failed - retry",
};
export const rushColors = { low: green, medium: amber, high: red };
export const rushLabels = {
  low: "Low rush",
  medium: "Medium rush",
  high: "High rush",
};
export const availabilityColors = {
  open: { dot: "#18725C", ...green },
  busy: { dot: "#936C14", ...amber },
  closed: { dot: "#B43443", ...red },
};
export const availabilityLabels = {
  open: "Open",
  busy: "Busy",
  closed: "Closed",
};
