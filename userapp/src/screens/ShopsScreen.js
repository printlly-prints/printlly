import { PressableScale } from "pressto";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import api from "../api/client";
import ShopRow, { ShopRowDivider } from "../components/ShopRow";
import { geoParams, useLocation } from "../context/LocationContext";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { colors, typography, spacing, radius } from "../theme";

const SEARCH_DEBOUNCE_MS = 400;

// Browse screen (Shops tab): lists active print shops from GET /shops.
// Tapping a shop starts the upload flow with that shop pre-selected, so
// it's already chosen by the time the flow reaches its Select Shop step.
//
// The search box filters by shop name, address or locality (?search=,
// debounced). If the customer has shared location, results are also
// sorted nearest first with a distance on each card (?lat=&lng=) - both
// params go together when both apply.
export default function ShopsScreen({ navigation }) {
  const {
    coords,
    areaLabel,
    status: locationStatus,
    ensureLocation,
  } = useLocation();

  const [shops, setShops] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState(""); // what's in the box
  const [activeQuery, setActiveQuery] = useState(""); // what was last searched for

  // Only the newest request may update the list - a slow response for
  // "grap" must not overwrite a faster one for "graphic era".
  const requestId = useRef(0);

  // Asks for location if this tab is reached before Home ever mounted.
  // No-op (no re-prompt) if the customer already answered.
  useEffect(() => {
    ensureLocation();
  }, [ensureLocation]);

  // `silent` skips the search spinner - used by the once-a-minute
  // open/closed refresh below, which isn't a search and shouldn't look
  // like one.
  const loadShops = useCallback(
    async (searchText, { silent } = {}) => {
      const id = ++requestId.current;
      if (!silent) setSearching(true);
      try {
        const trimmed = searchText.trim();
        const { data } = await api.get("/shops", {
          params: {
            ...(trimmed ? { search: trimmed } : {}),
            ...geoParams(coords),
          },
        });
        if (id !== requestId.current) return;
        setShops(data);
        setActiveQuery(trimmed);
        setError("");
      } catch (err) {
        if (id !== requestId.current) return;
        setError(
          err.response?.data?.message ||
            "Could not load shops. Check your connection.",
        );
      } finally {
        if (id === requestId.current) {
          setInitialLoading(false);
          setSearching(false);
          setRefreshing(false);
        }
      }
    },
    [coords],
  );

  // Debounced on typing; a location fix arriving (coords change) re-runs
  // it too, re-sorting the current results by distance.
  const isFirstRun = useRef(true);
  useEffect(() => {
    const delay = isFirstRun.current ? 0 : SEARCH_DEBOUNCE_MS;
    isFirstRun.current = false;
    const timer = setTimeout(() => loadShops(query), delay);
    return () => clearTimeout(timer);
  }, [query, loadShops]);

  // is_currently_open is computed server-side per request, so only a
  // refetch can turn a shop that just hit its closing time from "open" to
  // "Closed" here. Repeats the query the CURRENT results are for, not
  // whatever is half-typed in the box - that one is the debounce's job.
  const refreshOpenStatus = useCallback(
    () => loadShops(activeQuery, { silent: true }),
    [loadShops, activeQuery],
  );
  useOpenStatusRefresh(refreshOpenStatus);

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Outside the FlatList on purpose: as a list header the input would
          re-mount with the results and drop keyboard focus mid-typing. */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Ionicons
              name="search-outline"
              size={18}
              color={colors.textMuted}
            />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search shop name or area"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="never"
              accessibilityLabel="Search shops by name or area"
            />
            {searching ? (
              <ActivityIndicator size="small" color={colors.primaryBright} />
            ) : query ? (
              <PressableScale
                onPress={() => setQuery("")}
                hitSlop={10}
                accessibilityLabel="Clear search"
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textMuted}
                />
              </PressableScale>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Update current location"
            onPress={() => ensureLocation({ userInitiated: true })}
            style={styles.locate}
            disabled={locationStatus === "loading"}
          >
            {locationStatus === "loading" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name="locate-outline"
                size={22}
                color={colors.primary}
              />
            )}
          </Pressable>
        </View>
        {areaLabel ? (
          <Text style={styles.sortNote}>Near {areaLabel}</Text>
        ) : null}
        {locationStatus === "denied" || locationStatus === "unavailable" ? (
          <Text style={styles.sortNote}>
            Location is off. Search by area instead.
          </Text>
        ) : null}
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={shops}
        keyExtractor={(item) => item._id}
        ItemSeparatorComponent={ShopRowDivider}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadShops(query);
        }}
        ListHeaderComponent={
          error ? <Text style={styles.error}>{error}</Text> : null
        }
        ListEmptyComponent={
          !error ? (
            <Text style={styles.empty}>
              {activeQuery
                ? `No shops match '${activeQuery}'`
                : "No shops are available right now."}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <ShopRow
            shop={item}
            onPress={() => navigation.navigate("ShopDetails", { shop: item })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: 20, paddingTop: spacing.sm, flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  locate: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryWash,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    backgroundColor: colors.backgroundSoft,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  sortNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  empty: {
    textAlign: "center",
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    ...typography.bodySmall,
  },
});
