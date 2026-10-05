import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { rushColors, rushLabels, typography, radius } from "../theme";

// Emoji dot per level, per the design spec ("🟢 Low rush" etc.) - a quick
// visual read that doesn't rely on the badge's (already soft) colour
// alone.
const RUSH_EMOJI = { low: "🟢", medium: "🟡", high: "🔴" };

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
      <Text style={[styles.text, { color: palette.text }]}>
        {RUSH_EMOJI[level]} {rushLabels[level]}
      </Text>
    </View>
  );
}

export default memo(RushBadge);

const styles = StyleSheet.create({
  // See StatusBadge for why the border is load-bearing on a dark card.
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  text: { ...typography.caption },
});
