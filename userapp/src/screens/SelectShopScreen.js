import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Button from "../components/Button";
import RushBadge from "../components/RushBadge";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import api from "../api/client";
import { useLocation } from "../context/LocationContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { formatDistance } from "../utils/distance";
import { colors, typography, spacing, radius, shadows } from "../theme";

const RUSH_RANK = { low: 0, medium: 1, high: 2 };

// Step 3 of the order flow: compare shops on what THIS specific order
// would actually cost at each of them, not just a plain list picked
// blind. POST /shops/compare-pricing does the real work - it already
// excludes any shop that can't fulfil a requested service and sorts by
// total_amount ascending, so this screen mainly renders what comes back.
export default function SelectShopScreen({ route, navigation }) {
  const { uploadedDocs, docSettings, notes, preselectedShop } = route.params;

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("price"); // "price" | "rush" | "distance"
  // Not prompted here - by this point Home/Shops already asked. Used only
  // to add distance_km to results and offer a "Distance" sort; price stays
  // the default order either way.
  const { coords } = useLocation();

  const loadPrices = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    try {
      // Each document is priced on its own settings and the totals are
      // summed, so this comparison matches what POST /orders will charge.
      const { data } = await api.post("/shops/compare-pricing", {
        documents: toComparePricingDocuments(uploadedDocs, docSettings),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      setResults(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load shop prices. Check your connection.");
    } finally {
      setLoading(false);
    }
    // uploadedDocs/docSettings are stable for the lifetime of this screen
    // (set once on PrintPreferencesScreen, not edited here). coords is the
    // one real dependency: a location fix arriving re-fetches with
    // distances. "Gained focus again" is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  // Refetches every time this screen gains focus, not just on first
  // mount - in particular, when ReviewCheckoutScreen sends the customer
  // back here because their chosen shop closed in the meantime (see that
  // screen's own comment), this shows current prices/open-status rather
  // than the stale snapshot from before.
  useFocusEffect(
    useCallback(() => {
      loadPrices();
    }, [loadPrices])
  );

  // The "Select" button is disabled per shop off is_currently_open, which
  // the backend computes per request - so without this a shop that closed
  // while the customer sat on this screen would still look selectable
  // until they navigated away and back. Silent: no spinner over prices
  // they're in the middle of reading.
  const refreshOpenStatus = useCallback(() => loadPrices({ silent: true }), [loadPrices]);
  useOpenStatusRefresh(refreshOpenStatus);

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === "distance" && coords) {
      // Shops with no pinned location (distance_km null) go last.
      const da = typeof a.distance_km === "number" ? a.distance_km : Infinity;
      const db = typeof b.distance_km === "number" ? b.distance_km : Infinity;
      if (da !== db) return da - db;
      return a.total_amount - b.total_amount;
    }
    if (sortBy === "rush") {
      const rankA = RUSH_RANK[a.queue?.rush_level] ?? 3;
      const rankB = RUSH_RANK[b.queue?.rush_level] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      // Same rush bucket - break the tie by the finer-grained live count
      // rather than leaving it arbitrary.
      return (a.queue?.active_orders_count ?? 0) - (b.queue?.active_orders_count ?? 0);
    }
    return a.total_amount - b.total_amount;
  });

  const handleSelect = (result) => {
    navigation.navigate("ReviewCheckout", {
      uploadedDocs,
      docSettings,
      notes,
      shop: {
        _id: result.shop_id,
        shop_name: result.shop_name,
        address: result.address,
        shop_photo_url: result.shop_photo_url,
      },
      // The exact price this screen showed for this shop - ReviewCheckout
      // displays this directly rather than recomputing anything client-
      // side, so what the customer picked here is exactly what they see
      // next (see that screen's own comment for why this has to match
      // POST /orders precisely).
      priceBreakdown: result.price_breakdown,
      totalAmount: result.total_amount,
      // What each document costs at THIS shop, in uploadedDocs order -
      // computed server-side per document (see compare-pricing), so
      // ReviewCheckout can show a per-file bill without doing any maths
      // of its own.
      documentTotals: result.document_totals,
      // Which of THIS shop's services each document's request actually
      // matched, with the rate used. The customer may have typed
      // "lamination" and matched a shop's "Glossy Lamination" - from here
      // on it is the shop's real name that gets shown, not the request.
      documentServices: result.document_services,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={sortedResults}
        keyExtractor={(item) => item.shop_id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Compare prices</Text>
            <Text style={styles.subtitle}>Priced for your exact order - pick the shop that works for you.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!error && results.length > 0 ? (
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>Sort by</Text>
                <View style={styles.sortToggle}>
                  <SortOption label="Price" selected={sortBy === "price"} onPress={() => setSortBy("price")} />
                  <SortOption label="Rush" selected={sortBy === "rush"} onPress={() => setSortBy("rush")} />
                  {coords ? (
                    <SortOption
                      label="Distance"
                      selected={sortBy === "distance"}
                      onPress={() => setSortBy("distance")}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !error ? (
            <Text style={styles.empty}>
              No shops currently support this exact order. Try changing your preferences and going back.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const isPreselected = preselectedShop && preselectedShop._id === item.shop_id;
          // Still shown (with its real price, for later) rather than
          // excluded - only "Select" is blocked, since actually placing
          // an order there right now would just be rejected by the
          // server anyway (see ReviewCheckoutScreen's closed-shop
          // handling for the case where it closes AFTER being selected).
          const closed = item.is_currently_open === false;
          const distanceLabel = formatDistance(item.distance_km);
          return (
            <View style={[styles.card, isPreselected && styles.cardHighlighted, closed && styles.cardClosed]}>
              <ShopPhoto source={shopImageSource(item)} shopName={item.shop_name} style={styles.photo} closed={closed} />
              {isPreselected ? (
                <View style={styles.pickBadge}>
                  <Text style={styles.pickBadgeText}>Your pick</Text>
                </View>
              ) : null}

              <Text style={styles.shopName} numberOfLines={1}>
                {item.shop_name}
              </Text>
              <Text style={styles.address} numberOfLines={2}>
                {item.address}
              </Text>
              {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
              {item.queue?.rush_level ? <RushBadge level={item.queue.rush_level} style={styles.rushBadge} /> : null}

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Total for this order</Text>
                <Text style={styles.priceValue}>₹{item.total_amount}</Text>
              </View>

              <Button title="Select" onPress={() => handleSelect(item)} disabled={closed} />
              {closed ? <Text style={styles.closedNote}>Currently closed</Text> : null}
            </View>
          );
        }}
      />
    </View>
  );
}

function SortOption({ label, selected, onPress }) {
  return (
    <Pressable style={[styles.sortOption, selected && styles.sortOptionSelected]} onPress={onPress}>
      <Text style={[styles.sortOptionLabel, selected && styles.sortOptionLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  sortLabel: { ...typography.labelSmall, color: colors.textSecondary },
  sortToggle: {
    flexDirection: "row",
    backgroundColor: colors.backgroundSoft,
    borderRadius: radius.pill,
    padding: 3,
  },
  sortOption: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  // Same light-lift shadow as shadows.card, scaled down by its own small
  // shadowRadius - reused rather than inventing a one-off for this pill.
  sortOptionSelected: { backgroundColor: colors.surface, ...shadows.card },
  sortOptionLabel: { ...typography.labelSmall, color: colors.textSecondary },
  sortOptionLabelSelected: { color: colors.primaryDeep },
  card: {
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHighlighted: { borderColor: colors.primary },
  // Dimmed, not disabled - the card (and its price) stays visible so the
  // customer can still note it for later. Only the "Select" button itself
  // is disabled, above.
  cardClosed: { opacity: 0.6 },
  closedNote: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
  photo: { height: 120, marginBottom: spacing.md },
  pickBadge: {
    position: "absolute",
    top: spacing.xl + spacing.xs,
    left: spacing.xl + spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pickBadgeText: { ...typography.caption, color: colors.surface, fontWeight: "600" },
  shopName: { ...typography.h2, color: colors.textPrimary },
  address: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  distance: { ...typography.labelSmall, color: colors.primaryDeep, marginTop: spacing.xs },
  rushBadge: { marginTop: spacing.md },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: { ...typography.bodySmall, color: colors.textSecondary },
  priceValue: { ...typography.h2, color: colors.textPrimary },
  empty: { textAlign: "center", ...typography.body, color: colors.textSecondary, marginTop: 40 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    ...typography.bodySmall,
  },
});
