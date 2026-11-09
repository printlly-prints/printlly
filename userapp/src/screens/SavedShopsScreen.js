import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ShopRow, { ShopRowDivider } from "../components/ShopRow";
import { useSavedShops } from "../context/SavedShopsContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { colors, typography, spacing } from "../theme";

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
  const refreshOpenStatus = useCallback(
    () => refresh({ silent: true }),
    [refresh],
  );
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
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refresh}
          tintColor={colors.primaryBright}
        />
      }
      ListEmptyComponent={<Text style={styles.empty}>No saved shops yet.</Text>}
      ItemSeparatorComponent={ShopRowDivider}
      renderItem={({ item }) =>
        item.shop_id ? (
          <ShopRow
            shop={item.shop_id}
            onPress={() =>
              navigation.navigate("ShopDetails", { shop: item.shop_id })
            }
          />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingHorizontal: 20, paddingTop: spacing.sm, flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  empty: {
    textAlign: "center",
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 40,
    paddingHorizontal: spacing.xl,
  },
});
