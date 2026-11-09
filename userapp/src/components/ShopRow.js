import { Pressable, StyleSheet, Text, View } from "react-native";
import SavedShopHeart from "./SavedShopHeart";
import ShopPhoto from "./ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import { formatDistanceShort } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import { colors, radius, rushLabels, spacing, typography } from "../theme";

// 64 + 12px padding each side = an 88px three-line row (Material 3).
const PHOTO_SIZE = 64;

// One shop in a list. Only fields the API sends: no invented ratings.
export default function ShopRow({ shop, onPress }) {
  const availability = shopAvailability(shop);
  const status = [
    availability.label,
    availability.prepLine || rushLabels[shop.queue?.rush_level],
    formatDistanceShort(shop.distance_km),
  ]
    .filter(Boolean)
    .join(" · ");
  const bw = shop.pricing?.rate_per_page_bw;
  const colour = shop.pricing?.rate_per_page_color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"View " + shop.shop_name}
      // A dim, not a disable - a closed shop can still be viewed or saved.
      style={[styles.card, availability.isClosed && styles.closed]}
      onPress={onPress}
    >
      <ShopPhoto
        source={shopImageSource(shop)}
        shopName={shop.shop_name}
        style={styles.photo}
        iconSize={24}
        closed={availability.isClosed}
      />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {shop.shop_name}
          </Text>
          <SavedShopHeart shop={shop} size={20} style={styles.heart} />
        </View>
        {bw > 0 ? (
          <Text style={styles.rates} numberOfLines={1}>
            ₹{bw} B&W{colour > 0 ? ` · ₹${colour} colour` : ""}
          </Text>
        ) : null}
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: availability.colors.dot },
            ]}
          />
          <Text style={styles.status} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function ShopRowDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  closed: { opacity: 0.6 },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 14 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: {
    ...typography.label,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  // Pulled in so the 44px tap target doesn't add height to the row.
  heart: { marginVertical: -10, marginRight: -10 },
  rates: { ...typography.bodySmall, color: colors.textPrimary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: radius.pill },
  status: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: PHOTO_SIZE + spacing.md,
    backgroundColor: colors.borderStrong,
  },
});
