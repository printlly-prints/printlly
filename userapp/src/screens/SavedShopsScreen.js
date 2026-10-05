import { useCallback } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import SavedShopHeart from "../components/SavedShopHeart";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import { useSavedShops } from "../context/SavedShopsContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { formatDistance } from "../utils/distance";
import { colors, typography, spacing, radius } from "../theme";

// Reached from the Profile menu. Lists shops the customer has hearted
// elsewhere (Shops tab, Home's nearby list) - the list itself comes from
// the shared SavedShopsContext cache, so unsaving here or on any other
// screen stays in sync everywhere without a refetch.
export default function SavedShopsScreen({ navigation }) {
  const { savedShops, loading, refresh } = useSavedShops();

  // Saved shops are dimmed and marked "Closed" off is_currently_open,
  // computed server-side per request - so keep it current while this
  // screen is open rather than showing the status from whenever the
  // shared cache last loaded.
  const refreshOpenStatus = useCallback(() => refresh({ silent: true }), [refresh]);
  useOpenStatusRefresh(refreshOpenStatus);

  if (loading && savedShops.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={savedShops}
      keyExtractor={(item) => item._id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primaryBright} />}
      ListEmptyComponent={
        <Text style={styles.empty}>No saved shops yet — tap the heart on any shop to save it here.</Text>
      }
      renderItem={({ item }) => {
        const shop = item.shop_id;
        if (!shop) return null;
        // Dimmed and marked, not disabled - the point of saving a closed
        // shop is often exactly to order from it later. "Order Now" still
        // works; the actual shop picked at SelectShopScreen's price
        // comparison is what gets a disabled "Select" if still closed by
        // then (and POST /orders itself is the final, authoritative gate).
        const closed = shop.is_currently_open === false;
        const distanceLabel = formatDistance(shop.distance_km);
        return (
          <View style={[styles.card, closed && styles.cardClosed]}>
            <ShopPhoto source={shopImageSource(shop)} shopName={shop.shop_name} style={styles.photo} closed={closed} />
            <SavedShopHeart shop={shop} overlay style={styles.heartCorner} />
            <Text style={styles.shopName} numberOfLines={1}>
              {shop.shop_name}
            </Text>
            <Text style={styles.address}>{shop.address}</Text>
            {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
            {shop.contact ? <Text style={styles.contact}>{shop.contact}</Text> : null}
            <View style={styles.orderButton}>
              <Button
                title="Order Now"
                onPress={() => navigation.navigate("UploadDocuments", { preselectedShop: shop })}
              />
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  card: {
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { height: 120, marginBottom: spacing.md },
  cardClosed: { opacity: 0.6 },
  heartCorner: { position: "absolute", top: spacing.xl + spacing.xs, right: spacing.xl + spacing.xs },
  shopName: { ...typography.h2, color: colors.textPrimary },
  address: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  contact: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  distance: { ...typography.labelSmall, color: colors.primaryDeep, marginTop: spacing.xs },
  orderButton: { marginTop: spacing.lg },
  empty: {
    textAlign: "center",
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 40,
    paddingHorizontal: spacing.xl,
  },
});
