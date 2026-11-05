import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import RushBadge from "../components/RushBadge";
import { shopRushLevel } from "../utils/shopRush";
import ShopPhoto from "../components/ShopPhoto";
import api from "../api/client";
import { useLocation } from "../context/LocationContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { formatDistance } from "../utils/distance";
import { typography, spacing, radius, shadows } from "../theme";
import ScreenFrame from "../components/ScreenFrame";
import { useTheme, useThemedStyles } from "../context/ThemeContext";

const RUSH_RANK = { low: 0, medium: 1, high: 2 };

// Step 3 of the order flow: compare shops on what THIS specific order
// would actually cost at each of them, not just a plain list picked
// blind. POST /shops/compare-pricing does the real work - it already
// excludes any shop that can't fulfil a requested service and sorts by
// total_amount ascending, so this screen mainly renders what comes back.
export default function SelectShopScreen({ route, navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const { uploadedDocs, docSettings, notes, preselectedShop } = route.params;

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failure, setFailure] = useState(null);
  const [sortBy, setSortBy] = useState("price"); // "price" | "rush" | "distance"
  const [selectedId, setSelectedId] = useState(preselectedShop?._id || null);
  // Not prompted here - by this point Home/Shops already asked. Used only
  // to add distance_km to results and offer a "Distance" sort; price stays
  // the default order either way.
  const { coords } = useLocation();
  const request = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current += 1; }; }, []);

  const loadPrices = useCallback(async ({ silent } = {}) => {
    const id = ++request.current;
    if (!silent) setLoading(true);
    try {
      // Each document is priced on its own settings and the totals are
      // summed, so this comparison matches what POST /orders will charge.
      const { data } = await api.post("/shops/compare-pricing", {
        documents: toComparePricingDocuments(uploadedDocs, docSettings),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      if (!mounted.current || id !== request.current) return;
      setResults(data);
      setSelectedId((current) => data.some((item) => item.shop_id === current && item.shop_status !== "closed" && item.is_currently_open !== false) ? current : data.find((item) => item.shop_status !== "closed" && item.is_currently_open !== false)?.shop_id || null);
      setError(""); setFailure(null);
    } catch (err) {
      if (!mounted.current || id !== request.current) return;
      setFailure(err);
      setError(err.response?.data?.message || "Could not load shop prices. Check your connection.");
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
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
      const rankA = RUSH_RANK[shopRushLevel(a)] ?? 3;
      const rankB = RUSH_RANK[shopRushLevel(b)] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      // Same rush bucket - break the tie by the finer-grained live count
      // rather than leaving it arbitrary.
      const countA = typeof a.queue?.active_orders_count === 'number' && Number.isFinite(a.queue.active_orders_count) ? a.queue.active_orders_count : Infinity;
      const countB = typeof b.queue?.active_orders_count === 'number' && Number.isFinite(b.queue.active_orders_count) ? b.queue.active_orders_count : Infinity;
      return countA === countB ? 0 : countA - countB;
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
      <ScreenFrame title="Compare prices" onBack={() => navigation.goBack()}><View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View></ScreenFrame>
    );
  }

  const selectedShop = results.find((item) => item.shop_id === selectedId);
  return (
    <ScreenFrame title="Compare shops" onBack={() => navigation.goBack()} scroll={false} contentStyle={{ padding: 0 }}
      footer={<Button title={selectedShop ? `Choose ${selectedShop.shop_name}` : "Choose a shop"} disabled={!selectedShop || selectedShop.shop_status === "closed" || selectedShop.is_currently_open === false || Boolean(error)} onPress={() => selectedShop && handleSelect(selectedShop)} />}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={sortedResults}
        keyExtractor={(item) => item.shop_id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Compare your print.</Text>
            <Text style={styles.subtitle}>{uploadedDocs.length} files · same print options</Text>
            {error ? <RecoveryState compact {...recoveryForError(failure)} retryKey={failure} primaryLabel="Try again" onPrimary={loadPrices} loading={loading} /> : null}
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
            <RecoveryState reaction="not_found" title="No matching shops." message="No shops currently support these print options. Your files are kept; change the options to try again." primaryLabel="Change print options" onPrimary={() => navigation.goBack()} />
          ) : null
        }
        renderItem={({ item }) => {
          const isPreselected = preselectedShop && preselectedShop._id === item.shop_id;
          // Still shown (with its real price, for later) rather than
          // excluded - only "Select" is blocked, since actually placing
          // an order there right now would just be rejected by the
          // server anyway (see ReviewCheckoutScreen's closed-shop
          // handling for the case where it closes AFTER being selected).
          const closed = item.shop_status === "closed" || item.is_currently_open === false;
          const distanceLabel = formatDistance(item.distance_km);
          return (
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: item.shop_id === selectedId, disabled: closed }} disabled={closed} onPress={() => setSelectedId(item.shop_id)} style={[styles.card, item.shop_id === selectedId && styles.cardHighlighted, closed && styles.cardClosed]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><ShopPhoto source={item.shop_photo_url ? { uri: item.shop_photo_url } : null} shopName={item.shop_name} style={styles.photo} closed={closed} /><View style={{ flex: 1 }}>
              <Text style={styles.shopName} numberOfLines={2}>
                {item.shop_name}
              </Text>
              <Text style={styles.address} numberOfLines={2}>
                {item.address}
              </Text>
              {distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}
              </View></View>
              {shopRushLevel(item) ? <RushBadge shop={item} style={styles.rushBadge} /> : null}

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Total for this order</Text>
                <Text style={styles.priceValue}>₹{item.total_amount}</Text>
              </View>

              {closed ? <Text style={styles.closedNote}>Currently closed</Text> : null}
            </Pressable>
          );
        }}
      />
    </ScreenFrame>
  );
}

function SortOption({ label, selected, onPress }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={[styles.sortOption, selected && styles.sortOptionSelected]} onPress={onPress}>
      <Text style={[styles.sortOptionLabel, selected && styles.sortOptionLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = ({ colors }) => ({
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
  sortOption: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  // Same light-lift shadow as shadows.card, scaled down by its own small
  // shadowRadius - reused rather than inventing a one-off for this pill.
  sortOptionSelected: { backgroundColor: colors.surface, ...shadows.card },
  sortOptionLabel: { ...typography.labelSmall, color: colors.textSecondary },
  sortOptionLabelSelected: { color: colors.primaryDeep },
  card: {
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardHighlighted: { borderColor: colors.controlBorder, backgroundColor: colors.selection },
  // Dimmed, not disabled - the card (and its price) stays visible so the
  // customer can still note it for later. Only the "Select" button itself
  // is disabled, above.
  cardClosed: { opacity: 0.6 },
  closedNote: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.sm },
  photo: { width: 48, height: 48, borderRadius: 24 },
  pickBadge: {
    position: "absolute",
    top: spacing.xl + spacing.xs,
    left: spacing.xl + spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pickBadgeText: { ...typography.caption, color: colors.onAction, fontWeight: "600" },
  shopName: { ...typography.label, color: colors.textPrimary },
  address: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
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
