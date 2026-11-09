import { StyleSheet, Text, View } from "react-native";
import RushBadge from "./RushBadge";
import { shopAvailability } from "../utils/shopAvailability";
import { fonts, radius, spacing } from "../theme";

// Open/Busy/Closed and rush, drawn over a shop's photo.
export default function ShopStatusChips({ shop, style }) {
  const availability = shopAvailability(shop);
  return (
    <View style={[styles.row, style]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: availability.colors.bg,
            borderColor: availability.colors.border,
          },
        ]}
      >
        <View
          style={[styles.dot, { backgroundColor: availability.colors.dot }]}
        />
        <Text style={[styles.text, { color: availability.colors.text }]}>
          {availability.isBusy
            ? "Busy right now"
            : availability.isClosed
              ? "Closed"
              : "Open now"}
        </Text>
      </View>
      {!availability.isBusy && shop.queue?.rush_level ? (
        <RushBadge level={shop.queue.rush_level} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
  text: { fontFamily: fonts.headingBold, fontSize: 11.5 },
});
