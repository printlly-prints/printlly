import tokens from "../../../shared/design-tokens.json";
import { nativeColorAliases } from "./appearance";
// Static aliases remain for screens awaiting migration. Migrated components use ThemeContext.
export const colors = nativeColorAliases(tokens.colors.light);
export function semanticStatusColors(palette) {
  const info = { bg: palette.infoSurface, text: palette.info, border: palette.controlBorder };
  const success = { bg: palette.successSurface, text: palette.success, border: palette.controlBorder };
  const error = { bg: palette.errorSurface, text: palette.error, border: palette.controlBorder };
  const neutral = { bg: palette.subtle, text: palette.textSecondary, border: palette.controlBorder };
  return { pending: info, accepted: info, ready_for_pickup: success, completed: neutral, cancelled: error, expired: neutral, payment_pending: info, payment_failed: error };
}
export const statusColors = semanticStatusColors(colors);
export const statusLabels = { pending: "Awaiting acceptance", accepted: "Accepted", ready_for_pickup: "Ready for pickup", completed: "Collected", cancelled: "Cancelled", expired: "Expired", payment_pending: "Payment pending", payment_failed: "Payment not completed" };
export const rushColors = { low: statusColors.ready_for_pickup, medium: statusColors.pending, high: statusColors.payment_failed };
export const rushLabels = { low: "Low rush", medium: "Medium rush", high: "High rush" };
export const availabilityColors = { open: { ...statusColors.ready_for_pickup, dot: colors.success }, busy: { ...statusColors.pending, dot: colors.info }, closed: { ...statusColors.cancelled, dot: colors.error } };
export const availabilityLabels = { open: "Open", busy: "Busy", closed: "Closed" };
