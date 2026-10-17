import { Image } from "react-native";

// Metro registers static modules; only the selected Image is mounted/decoded.
const art = {
  payment_failed: () => require("../../assets/mascot-reactions/payment_failed.png"),
  payment_uncertain: () => require("../../assets/mascot-reactions/payment_uncertain.png"),
  cancelled: () => require("../../assets/mascot-reactions/cancelled.png"),
  offline: () => require("../../assets/mascot-reactions/offline.png"),
  service_unavailable: () => require("../../assets/mascot-reactions/service_unavailable.png"),
  not_found: () => require("../../assets/mascot-reactions/not_found.png"),
  upload_failed: () => require("../../assets/mascot-reactions/upload_failed.png"),
  access_expired: () => require("../../assets/mascot-reactions/access_expired.png"),
  shop_unavailable: () => require("../../assets/mascot-reactions/shop_unavailable.png"),
};
/** Static decorative artwork; the adjacent text conveys the state. */
export function MascotReaction({ reaction, size = 120, style }) {
  const source = art[reaction];
  if (!source) return null;
  return <Image source={source()} resizeMode="contain" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width: size, height: size, flexShrink: 0 }, style]} />;
}
export default MascotReaction;
