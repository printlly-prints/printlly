import { Pressable, Text, View } from "react-native";
import ShopPhoto from "./ShopPhoto";
import SavedShopHeart from "./SavedShopHeart";
import RushBadge from "./RushBadge";
import { useThemedStyles } from "../context/ThemeContext";
import { shopAvailability } from "../utils/shopAvailability";
import { shopRushLevel } from "../utils/shopRush";
import { formatDistanceShort } from "../utils/distance";
import { typography, radius } from "../theme";

// M11/M15: an actual vendor photo, and live availability rather than a
// generic quote. Pricing requires documents and print settings.
export default function ShopBrowseCard({ shop, onPress, style }) {
  const styles = useThemedStyles(createStyles), availability = shopAvailability(shop);
  const location = [formatDistanceShort(shop.distance_km), shop.locality || shop.address].filter(Boolean).join(" · ");
  const hasStatus = Boolean(shop.shop_status) || typeof shop.is_currently_open === "boolean";
  const rushLevel = shopRushLevel(shop);
  const body = <>
    <View style={styles.identity}><ShopPhoto source={shop.shop_photo_url ? { uri: shop.shop_photo_url } : null} shopName={shop.shop_name} style={styles.photo} iconSize={24} /><View style={styles.copy}><Text style={styles.name}>{shop.shop_name}</Text>{location ? <Text style={styles.note}>{location}</Text> : null}</View></View>
    {hasStatus || rushLevel ? <View style={styles.statusRow}>{rushLevel ? <RushBadge shop={shop} /> : null}{hasStatus ? <Text style={styles.note}>{availability.label}{availability.isBusy && shop.busy_prep_minutes ? ` · preparation about ${shop.busy_prep_minutes} min` : ""}</Text> : null}</View> : null}
  </>;
  return <View style={[styles.card, style]}><View style={styles.header}>
    {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`View ${shop.shop_name}`} style={({ pressed }) => [styles.main, pressed && styles.pressed]}>{body}</Pressable> : <View style={styles.main}>{body}</View>}
    <SavedShopHeart shop={shop} style={styles.heart} />
  </View></View>;
}
const createStyles = ({ colors }) => ({
  card: { padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.controlBorder }, header: { flexDirection: "row", alignItems: "flex-start", gap: 4 }, main: { flex: 1, minWidth: 0, gap: 16 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }, photo: { width: 44, height: 44, borderRadius: 22 }, copy: { flex: 1, minWidth: 0 }, name: { ...typography.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textSecondary, flexShrink: 1, marginTop: 2 }, statusRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, heart: { marginTop: -4, marginRight: -8 }, pressed: { opacity: 0.8 },
});
