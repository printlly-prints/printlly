import { memo } from "react";
import { useTheme } from "../context/ThemeContext";
import { StyleSheet, Text, View } from "react-native";
import { rushLabels, typography, radius } from "../theme";
import { shopRushLevel } from "../utils/shopRush";

// Small pill showing a shop's live rush level - the same shape as
// StatusBadge, for a shop's queue instead of an order's status. Used on
// ShopsScreen, HomeScreen's nearby-shops cards, and SelectShopScreen.
//
// `shop.queue.rush_level` is GET /shops / GET /shops/:shopId/queue's rush_level
// ("low"/"medium"/"high"). Renders nothing for an unrecognized or
// missing level rather than guessing. The shared guard also suppresses cached
// levels when either authoritative availability field says the shop is closed.
// memo()'d for the same reason as ShopPhoto: one per row across three
// lists, with primitive/stable props.
function RushBadge({ shop, style }) {
  const { colors } = useTheme();
  const level = shopRushLevel(shop);
  const palettes = { low: { bg: colors.successSurface, text: colors.success }, medium: { bg: colors.infoSurface, text: colors.info }, high: { bg: colors.errorSurface, text: colors.error } };
  const palette = palettes[level];
  if (!palette) return null;

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg, borderColor: colors.controlBorder }, style]}
    >
      <View accessible={false} style={[styles.dot, { backgroundColor: palette.text }]} />
      <Text style={[styles.text, { color: palette.text }]}>{rushLabels[level]}</Text>
    </View>
  );
}

export default memo(RushBadge);

const styles = StyleSheet.create({
  // See StatusBadge for why the border is load-bearing on a dark card.
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  text: { ...typography.caption },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
