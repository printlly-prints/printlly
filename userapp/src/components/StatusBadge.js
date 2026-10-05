import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { statusColors, statusLabels, typography, radius } from "../theme";

// Small coloured pill showing an order's current status. Colours are
// deliberately not teal - see theme/colors.js for why.
//
// memo()'d: one per row in MyOrdersScreen's list and HomeScreen's recent
// orders, taking a single string prop.
function StatusBadge({ status }) {
  const palette = statusColors[status] || statusColors.completed;

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Text style={[styles.text, { color: palette.text }]}>
        {statusLabels[status] || status}
      </Text>
    </View>
  );
}

export default memo(StatusBadge);

const styles = StyleSheet.create({
  // borderWidth is what makes the pill read as a pill on a dark card.
  // Several status fills land at nearly the same luminance as the card
  // behind them (a teal-green "ready" fill on a teal-green card is the
  // worst case), so without this edge the label looks like floating text.
  // The colour comes from the status itself - see theme/colors.js.
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  text: { ...typography.labelSmall },
});
