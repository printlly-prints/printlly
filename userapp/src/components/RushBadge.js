import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { rushColors, rushLabels, typography, radius } from "../theme";

// Small pill showing a shop's live rush level - the same shape as
// StatusBadge, for a shop's queue instead of an order's status. Used on
// ShopsScreen, HomeScreen's nearby-shops cards, and SelectShopScreen.
//
// `level` is GET /shops / GET /shops/:shopId/queue's rush_level
// ("low"/"medium"/"high"). Renders nothing for an unrecognized or
// missing level rather than guessing - callers should already guard on
// `shop.queue` existing, but this is a second line of defense.
// memo()'d for the same reason as ShopPhoto: one per row across three
// lists, with primitive/stable props.
function RushBadge({ level, style }) {
  const palette = rushColors[level];
  if (!palette) return null;

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
    >
      <View style={[styles.dot, { backgroundColor: palette.text }]} />
      <Text style={[styles.text, { color: palette.text }]}>
        {rushLabels[level]}
      </Text>
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
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  text: { ...typography.caption },
});
