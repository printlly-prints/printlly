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
import SavedShopHeart from "../components/SavedShopHeart";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import { geoParams, useLocation } from "../context/LocationContext";
import { formatDistanceShort } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import {
  colors,
  typography,
  fonts,
  spacing,
  radius,
  shadows,
  rushLabels,
} from "../theme";

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
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
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
          style={styles.locationRow}
          disabled={locationStatus === "loading"}
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.locationEyebrow}>PRINT NEAR YOU</Text>
            <Text style={styles.locationText}>
              {areaLabel ||
                (locationStatus === "loading"
                  ? "Finding your location…"
                  : "Use your current location")}
            </Text>
          </View>
          <Ionicons name="locate-outline" size={22} color={colors.primary} />
        </Pressable>
        {locationStatus === "denied" || locationStatus === "unavailable" ? (
          <Text style={styles.sortNote}>
            Location isn’t available. You can search by area above.
          </Text>
        ) : null}
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={shops}
        keyExtractor={(item) => item._id}
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
                ? `No shops found near '${activeQuery}' — try a different area name`
                : "No shops are available right now."}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          // Closed shops stay fully tappable (a customer can still view
          // details or save one for later) - just visually dimmed and
          // marked, never disabled or hidden. Tapping opens the shop's
          // details screen; ordering starts from there.
          const availability = shopAvailability(item);
          const closed = availability.isClosed;
          const distanceLabel = formatDistanceShort(item.distance_km);
          const location = [item.locality, item.address]
            .filter(Boolean)
            .join(", ");
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"View " + item.shop_name}
              style={[styles.card, closed && styles.cardClosed]}
              onPress={() => navigation.navigate("ShopDetails", { shop: item })}
            >
              <View style={index === 0 ? styles.featuredCard : styles.rowCard}>
                <View
                  style={
                    index === 0
                      ? styles.featuredPhotoWrap
                      : styles.smallPhotoWrap
                  }
                >
                  <ShopPhoto
                    source={shopImageSource(item)}
                    shopName={item.shop_name}
                    style={index === 0 ? styles.featuredPhoto : styles.photo}
                    iconSize={24}
                    closed={closed}
                  />
                  {index === 0 ? (
                    <SavedShopHeart
                      shop={item}
                      overlay
                      style={styles.photoSave}
                    />
                  ) : null}
                </View>

                <View
                  style={[
                    styles.details,
                    index === 0 && styles.featuredDetails,
                  ]}
                >
                  <View style={styles.titleRow}>
                    <Text style={styles.shopName} numberOfLines={1}>
                      {item.shop_name}
                    </Text>
                    {/* Off the photo now, so no translucent backing is
                      needed to keep it legible. */}
                    {index > 0 ? (
                      <SavedShopHeart
                        shop={item}
                        size={20}
                        style={styles.heart}
                      />
                    ) : null}
                  </View>

                  {/* Only fields GET /shops actually sends. It carries no
                    rating and deliberately drops `pricing` (see
                    getActiveShops), so there is no "4.8 (56)" and no
                    "₹2/page" here - both would be made up about a real
                    business. */}
                  {location ? (
                    <View style={styles.metaRow}>
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={styles.metaText} numberOfLines={1}>
                        {location}
                      </Text>
                    </View>
                  ) : null}

                  {/* While busy, the vendor's own preparation estimate
                    replaces the generic rush reading - it is the more
                    specific promise, and it is the whole difference busy
                    makes to this customer. */}
                  <View style={styles.metaRow}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: availability.colors.dot },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: availability.colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {[
                        availability.label,
                        availability.prepLine ||
                          rushLabels[item.queue?.rush_level],
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>

                  {distanceLabel || item.contact ? (
                    <View style={styles.footerRow}>
                      {distanceLabel ? (
                        <Text style={styles.distance}>{distanceLabel}</Text>
                      ) : null}
                      {item.contact ? (
                        <Text style={styles.contact} numberOfLines={1}>
                          {item.contact}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                {index === 0 && (
                  <View pointerEvents="none" style={styles.cardOutline} />
                )}
              </View>
            </Pressable>
          );
        }}
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
  searchBar: {
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
  // 122px photo + 12px padding top and bottom = a 146px row, against
  // roughly 300px before. The height is set by the photo, not by the
  // text, so a shop with no locality doesn't produce a shorter card.
  card: {
    marginBottom: spacing.sm,
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 0,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  photo: { width: 88, height: 88, borderRadius: 0 },
  smallPhotoWrap: { width: 88 },
  featuredCard: {
    flexDirection: "column",
    gap: 0,
    paddingVertical: 0,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  featuredPhotoWrap: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  featuredPhoto: { width: "100%", height: 174, borderRadius: 0 },
  cardOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
  },
  featuredDetails: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: "100%",
  },
  photoSave: { position: "absolute", top: spacing.md, right: spacing.md },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 72,
    paddingTop: spacing.sm,
  },
  locationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryWash,
  },
  locationEyebrow: {
    ...typography.labelSmall,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  locationText: { ...typography.labelSmall, color: colors.ink, marginTop: 2 },
  // A dim, not a disable - the card stays fully tappable while closed.
  cardClosed: { opacity: 0.6 },
  // Soft teal wash instead of a plain opacity dim, to match the shared
  // "primaryWash for selected/active states" pattern.
  cardPressed: {
    backgroundColor: colors.primaryWash,
    borderColor: colors.primary,
  },
  // minWidth: 0 so a long shop name truncates inside this column instead
  // of widening it and pushing the photo off the card.
  details: { flex: 1, minWidth: 0, paddingVertical: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  shopName: {
    flex: 1,
    minWidth: 0,
    ...typography.label,
    color: colors.textPrimary,
  },
  // Pulled up and out so the 32px tap target doesn't add height to the
  // row it sits in, while staying a 32px tap target.
  heart: { marginVertical: -7, marginRight: -6 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: spacing.xs,
  },
  metaText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  // Colour is applied inline from shopAvailability() - open, busy and
  // closed each have their own, and busy must never be red.
  statusDot: { width: 6, height: 6, borderRadius: radius.pill },
  statusText: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  distance: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primaryDeep,
  },
  contact: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
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
