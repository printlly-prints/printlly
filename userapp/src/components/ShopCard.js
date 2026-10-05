import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ShopPhoto from "./ShopPhoto";
import Card from "./Card";
import { shopImageSource } from "../utils/shopImages";
import { formatDistance } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import { colors, typography, spacing, radius } from "../theme";

// The shop, shown the same way everywhere it appears - checkout, order
// tracking, pickup. One component so the photo, the name and the address
// can never be assembled differently on two screens.
//
// The Open/Busy/Closed badge comes from the one shared resolver
// (utils/shopAvailability.js), so this shop reads the same here as it
// does on Home, Find Shops and its own details screen.
//
// Deliberately NOT shown: a star rating and review count. The reference
// has them, but this backend stores neither - no Shop field, no review
// collection, no route. A hardcoded "4.6 (210)" would be an invented
// endorsement of a real business, which is worse than an absent one.
// Everything below is a field that actually exists on the shop.
export default function ShopCard({
  shop,
  distanceKm,
  actionLabel,
  onAction,
  showContact,
  showActions,
  style,
}) {
  if (!shop) return null;

  // Open / Busy / Closed from the one shared resolver. `hasStatus` keeps
  // the old behaviour of showing nothing at all when the caller fetched a
  // shop without its status, rather than guessing at "open".
  const hasStatus = typeof shop.is_currently_open === "boolean" || !!shop.shop_status;
  const availability = shopAvailability(shop);
  const distance = formatDistance(distanceKm ?? shop.distance_km);

  const call = () => {
    if (shop.contact) Linking.openURL(`tel:${String(shop.contact).replace(/\s/g, "")}`).catch(() => {});
  };

  const openMap = () => {
    // Prefer the pinned coordinates when the vendor has set them; fall
    // back to searching the address, which is all we have otherwise.
    const coords = shop.location?.coordinates;
    const query =
      Array.isArray(coords) && coords.length === 2
        ? `${coords[1]},${coords[0]}`
        : encodeURIComponent(`${shop.shop_name} ${shop.address || ""}`.trim());
    const url = Platform.select({
      ios: `maps://?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://maps.google.com/?q=${query}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Card style={style}>
      <View style={styles.row}>
        <ShopPhoto source={shopImageSource(shop)} shopName={shop.shop_name} style={styles.photo} iconSize={22} />

        <View style={styles.details}>
          <Text style={styles.name} numberOfLines={1}>
            {shop.shop_name}
          </Text>

          {shop.address ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={styles.meta} numberOfLines={2}>
                {shop.address}
              </Text>
            </View>
          ) : null}

          {showContact && shop.contact ? (
            <View style={styles.metaRow}>
              <Ionicons name="call-outline" size={13} color={colors.textMuted} />
              <Text style={styles.meta}>{shop.contact}</Text>
            </View>
          ) : null}

          <View style={styles.badgeRow}>
            {/* Open/closed comes from the server's computed
                is_currently_open (manual toggle AND business hours), not
                from reading the hours in the app. Absent rather than
                guessed when the caller didn't fetch it. */}
            {hasStatus ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: availability.colors.bg, borderColor: availability.colors.border },
                ]}
              >
                <View style={[styles.dot, { backgroundColor: availability.colors.dot }]} />
                <Text style={[styles.badgeText, { color: availability.colors.text }]}>
                  {availability.isBusy
                    ? availability.prepLine
                      ? `Busy · ${availability.prepLine}`
                      : "Busy"
                    : availability.isClosed
                    ? "Closed"
                    : "Open now"}
                </Text>
              </View>
            ) : null}
            {distance ? <Text style={styles.distance}>{distance}</Text> : null}
          </View>
        </View>

        {actionLabel ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {showActions ? (
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={call}
            disabled={!shop.contact}
          >
            <Ionicons name="call-outline" size={16} color={colors.primaryBright} />
            <Text style={styles.actionButtonLabel}>Call shop</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={openMap}
          >
            <Ionicons name="map-outline" size={16} color={colors.primaryBright} />
            <Text style={styles.actionButtonLabel}>View on map</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  // Big enough to actually recognise the storefront, per the brief, while
  // leaving the name and address room on a narrow screen.
  photo: { width: 64, height: 64, borderRadius: radius.sm },
  details: { flex: 1 },
  name: { ...typography.label, color: colors.textPrimary },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 3 },
  meta: { ...typography.caption, color: colors.textSecondary, flex: 1 },

  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    // borderWidth is load-bearing on a dark card - see StatusBadge.
    borderWidth: 1,
  },
  // Colour comes inline from shopAvailability() - busy is amber, never
  // red, because a busy shop is still taking orders.
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...typography.caption },
  distance: { ...typography.caption, color: colors.textMuted },

  action: { ...typography.labelSmall, color: colors.primaryBright },

  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionButtonPressed: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  actionButtonLabel: { ...typography.labelSmall, color: colors.primaryBright },
});
