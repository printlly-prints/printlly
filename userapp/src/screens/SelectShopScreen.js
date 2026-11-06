import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import PrintState from "../components/PrintState";
import { formatRupees } from "../components/PriceBreakdown";
import api from "../api/client";
import { useLocation } from "../context/LocationContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { selectedQuote, selectableQuote } from "../utils/quoteSelection";
import { formatDistance } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import { colors, typography, spacing, rushLabels } from "../theme";

const RUSH_RANK = { low: 0, medium: 1, high: 2 };
export default function SelectShopScreen({ route, navigation }) {
  const { uploadedDocs, docSettings, notes, preselectedShop } = route.params;
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();
  const [results, setResults] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("price"),
    [selectedId, setSelectedId] = useState(preselectedShop?._id || null);
  const loadPrices = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await api.post("/shops/compare-pricing", {
          documents: toComparePricingDocuments(uploadedDocs, docSettings),
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        setResults(data);
        setError("");
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Could not load shop prices. Check your connection.",
        );
      } finally {
        setLoading(false);
      }
    },
    [coords, uploadedDocs, docSettings],
  );
  useFocusEffect(
    useCallback(() => {
      loadPrices();
    }, [loadPrices]),
  );
  useOpenStatusRefresh(
    useCallback(() => loadPrices({ silent: true }), [loadPrices]),
  );
  const hasDistances = results.some((q) => Number.isFinite(q.distance_km));
  const sorted = [...results].sort((a, b) => {
    if (sortBy === "distance")
      return (
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) ||
        a.total_amount - b.total_amount
      );
    if (sortBy === "rush")
      return (
        (RUSH_RANK[a.queue?.rush_level] ?? 3) -
          (RUSH_RANK[b.queue?.rush_level] ?? 3) ||
        (a.queue?.active_orders_count ?? a.queue?.active_orders ?? 0) -
          (b.queue?.active_orders_count ?? b.queue?.active_orders ?? 0) ||
        a.total_amount - b.total_amount
      );
    return a.total_amount - b.total_amount;
  });
  const chosen = selectedQuote(sorted, selectedId);
  const handleContinue = () => {
    if (!chosen || loading || error) return;
    navigation.navigate("ReviewCheckout", {
      uploadedDocs,
      docSettings,
      notes,
      shop: { ...chosen, _id: chosen.shop_id },
      priceBreakdown: chosen.price_breakdown,
      totalAmount: chosen.total_amount,
      documentTotals: chosen.document_totals,
      documentServices: chosen.document_services,
    });
  };
  if (loading && !results.length)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  const pages = uploadedDocs.reduce((sum, d) => sum + d.page_count, 0);
  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={sorted}
        keyExtractor={(item) => item.shop_id}
        ListHeaderComponent={
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {uploadedDocs.length}{" "}
                {uploadedDocs.length === 1 ? "document" : "documents"} · {pages}{" "}
                pages · priced for your settings
              </Text>
            </View>
            <View style={styles.sortRow}>
              <Sort
                label="Lowest total"
                selected={sortBy === "price"}
                onPress={() => setSortBy("price")}
              />
              {hasDistances ? (
                <Sort
                  label="Nearest"
                  selected={sortBy === "distance"}
                  onPress={() => setSortBy("distance")}
                />
              ) : null}
              <Sort
                label="Lowest rush"
                selected={sortBy === "rush"}
                onPress={() => setSortBy("rush")}
              />
            </View>
            {error ? (
              <PrintState
                kind="offline"
                title="Prices couldn’t refresh"
                body={error}
                action="Try again"
                onAction={() => loadPrices()}
              />
            ) : (
              <Text style={styles.count}>
                {results.length}{" "}
                {results.length === 1 ? "shop can" : "shops can"} print this
                order
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          !error ? (
            <PrintState
              title="No matching shops"
              body="Try changing your print preferences or finishing services."
            />
          ) : null
        }
        renderItem={({ item }) => {
          const active = chosen?.shop_id === item.shop_id,
            availability = shopAvailability(item),
            closed = !selectableQuote(item),
            distance = formatDistance(item.distance_km);
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={`${item.shop_name}, ${formatRupees(item.total_amount)} total${closed ? ", closed" : ""}`}
              accessibilityState={{ checked: active, disabled: closed }}
              aria-checked={active}
              disabled={closed}
              onPress={() => setSelectedId(item.shop_id)}
              style={[
                styles.quote,
                active && styles.selected,
                closed && styles.closed,
              ]}
            >
              <Ionicons
                name={active ? "checkmark-circle" : "ellipse-outline"}
                size={25}
                color={active ? colors.primary : colors.border}
              />
              <View style={styles.quoteCopy}>
                <Text style={styles.shopName}>{item.shop_name}</Text>
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: availability.colors.dot },
                    ]}
                  />
                  <Text
                    style={[styles.meta, { color: availability.colors.text }]}
                  >
                    {availability.label}
                  </Text>
                  {distance ? (
                    <Text style={styles.meta}>{distance}</Text>
                  ) : null}
                </View>
                <Text style={styles.meta}>
                  {availability.prepLine ||
                    rushLabels[item.queue?.rush_level] ||
                    ""}
                </Text>
                {closed ? (
                  <Text style={styles.meta}>
                    Not accepting orders right now
                  </Text>
                ) : null}
              </View>
              <View style={styles.amount}>
                <Text style={styles.total}>
                  {formatRupees(item.total_amount)}
                </Text>
                <Text style={styles.meta}>total</Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        <Button
          title={
            chosen
              ? `Review order · ${formatRupees(chosen.total_amount)}`
              : "Choose a shop"
          }
          onPress={handleContinue}
          disabled={!chosen || Boolean(error) || loading}
        />
      </View>
    </View>
  );
}
function Sort({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={[styles.sort, selected && styles.sortSelected]}
    >
      <Text style={[styles.sortText, selected && { color: colors.onPrimary }]}>
        {label}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  content: { padding: 20 },
  summary: {
    backgroundColor: colors.backgroundSoft,
    padding: spacing.lg,
    borderRadius: 22,
  },
  summaryText: { ...typography.bodySmall, color: colors.ink },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  sort: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  sortSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  sortText: { ...typography.labelSmall, fontSize: 12, color: colors.ink },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  quote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 24,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  selected: { borderColor: colors.primary },
  closed: { opacity: 0.6 },
  quoteCopy: { flex: 1, gap: spacing.xs },
  shopName: { ...typography.label, color: colors.ink },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  amount: { alignItems: "flex-end", gap: spacing.xs },
  total: {
    ...typography.h3,
    fontSize: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  footer: { padding: 20, borderTopWidth: 1, borderColor: colors.border },
});
