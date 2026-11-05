import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import ShopPhoto from "../components/ShopPhoto";
import { useSavedShops } from "../context/SavedShopsContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { shopAvailability } from "../utils/shopAvailability";
import { formatDistance } from "../utils/distance";
import { typography, radius } from "../theme";

export default function SavedShopsScreen({ navigation }) {
  const { savedShops, loading, refresh, toggleSaved } = useSavedShops();
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [removingId, setRemovingId] = useState(null);
  const removing = useRef(false);
  const refreshOpenStatus = useCallback(() => refresh({ silent: true }), [refresh]);
  useOpenStatusRefresh(refreshOpenStatus);
  useFocusEffect(useCallback(() => { refreshOpenStatus(); }, [refreshOpenStatus]));
  const removeShop = async (shop) => {
    if (removing.current) return;
    removing.current = true;
    setRemovingId(shop._id);
    try { await toggleSaved(shop); } finally { removing.current = false; setRemovingId(null); }
  };
  return <ScreenFrame title="Saved shops" onBack={() => navigation.goBack()} scroll={false} contentStyle={styles.frameContent}>
    <FlatList style={styles.list} contentContainerStyle={styles.listContent} data={savedShops.filter((entry) => entry.shop_id)} keyExtractor={(entry) => String(entry._id)}
      refreshControl={<RefreshControl refreshing={loading && savedShops.length > 0} onRefresh={() => refresh()} tintColor={colors.action} />}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={colors.action} /><Text style={styles.note}>Loading saved shops…</Text></View> :
        <View style={styles.empty}><Ionicons name="heart-outline" size={32} color={colors.action} /><Text style={styles.emptyTitle}>Your favourites, right here.</Text><Text style={styles.note}>Save a shop to find it easily next time.</Text><Button title="Find a shop" onPress={() => navigation.navigate("MainTabs", { screen: "Shops" })} style={styles.emptyButton} /></View>}
      renderItem={({ item }) => {
        const shop = item.shop_id, availability = shopAvailability(shop), distance = formatDistance(shop.distance_km);
        const statusColor = availability.isClosed ? colors.error : availability.isBusy ? colors.info : colors.success;
        const statusSurface = availability.isClosed ? colors.errorSurface : availability.isBusy ? colors.infoSurface : colors.successSurface;
        return <View style={styles.card}>
          <View style={styles.heading}>
            <Pressable onPress={() => navigation.navigate("ShopDetails", { shop })} accessibilityRole="button" accessibilityLabel={`View ${shop.shop_name}`} style={styles.shopLink}>
              <ShopPhoto source={shop.shop_photo_url ? { uri: shop.shop_photo_url } : null} shopName={shop.shop_name} style={styles.photo} closed={availability.isClosed} />
              <View style={styles.copy}><Text style={styles.shopName}>{shop.shop_name}</Text>{distance ? <Text style={styles.note}>{distance}</Text> : null}</View>
            </Pressable>
            <Pressable onPress={() => removeShop(shop)} disabled={Boolean(removingId)} accessibilityRole="button" accessibilityLabel={`Remove ${shop.shop_name} from saved shops`} accessibilityState={{ disabled: Boolean(removingId), busy: removingId === shop._id }} style={styles.heart}>
              {removingId === shop._id ? <ActivityIndicator size="small" color={colors.action} /> : <Ionicons name="heart" size={22} color={colors.action} />}
            </Pressable>
          </View>
          <Text style={styles.address}>{shop.address}</Text>
          {typeof shop.is_currently_open === "boolean" || shop.shop_status ? <View style={[styles.status, { backgroundColor: statusSurface }]}><Text style={[styles.statusLabel, { color: statusColor }]}>{availability.label}</Text></View> : null}
          {availability.isBusy && shop.busy_prep_minutes ? <Text style={styles.note}>Preparation estimate: about {shop.busy_prep_minutes} minutes.</Text> : null}
          <Button title={availability.isClosed ? "View shop" : "Print here"} variant="secondary" style={styles.action}
            onPress={() => availability.isClosed ? navigation.navigate("ShopDetails", { shop }) : navigation.navigate("UploadDocuments", { preselectedShop: shop })} />
        </View>;
      }} />
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  frameContent: { padding: 0 }, list: { flex: 1 }, listContent: { padding: 24, flexGrow: 1, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 10 }, heading: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  shopLink: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 }, copy: { flex: 1 }, photo: { width: 52, height: 52, borderRadius: 12 },
  heart: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }, shopName: { ...typography.h3, color: colors.textPrimary }, address: { ...typography.bodySmall, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, status: { alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 }, statusLabel: { ...typography.caption },
  action: { marginTop: 4 }, empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 12 },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: "center" }, emptyButton: { marginTop: 12, alignSelf: "stretch" },
});
