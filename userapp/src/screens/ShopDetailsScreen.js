import { useCallback, useEffect, useState } from "react";
import { trackEvent, EVENTS } from "../lib/analytics";
import { DEMO_MODE } from "../config/runtime";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import ShopStatusChips from "../components/ShopStatusChips";
import SavedShopHeart from "../components/SavedShopHeart";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import { shopMaps, googleMapHtml } from "../utils/shopMaps";
import api from "../api/client";
import { geoParams, useLocation } from "../context/LocationContext";
import { formatDistance } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import {
  colors,
  typography,
  fonts,
  spacing,
  radius,
  shadows,
  availabilityColors,
} from "../theme";

// Tapping a shop card used to jump straight into "Add documents", which
// gave a customer no way to look at a shop before committing to it. This
// is that missing step: the shop's own photograph, where it is, what it
// charges, whether it's open and how busy - with "Print here" pinned to
// the bottom continuing into the upload flow exactly as the card used to.
//
// Everything here comes from GET /shops/:shopId rather than the shop
// object the card was rendered from: that one is the LISTING projection,
// which deliberately carries no pricing. The list's copy is still used as
// an immediate placeholder (see `shop` below) so the screen opens with a
// name and photo rather than a spinner.
//
// The rates shown are the shop's own advertised prices, not a quote - the
// real total for a real order (platform fee included) still comes from
// POST /shops/compare-pricing at the Select-shop step.

const HERO_HEIGHT = 240;

export default function ShopDetailsScreen({ navigation, route }) {
  const { shop: initialShop } = route.params;
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();

  const [shop, setShop] = useState(initialShop);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/shops/${initialShop._id}`, {
        params: geoParams(coords),
      });
      setShop(data);
      setError("");
    } catch (err) {
      setError(
        err.response?.status === 404
          ? "This shop is no longer available."
          : err.response?.data?.message ||
              "Couldn't load this shop. Check your connection.",
      );
    } finally {
      setLoading(false);
    }
  }, [initialShop._id, coords]);

  useEffect(() => {
    load();
  }, [load]);

  // shop_viewed - the step between browsing and starting an order, and the
  // one the server cannot see: opening a shop's page is not an API call it
  // can distinguish from a list refresh.
  //
  // Keyed on the shop id so it fires once per shop rather than on every
  // one-a-minute status refresh. The shop NAME is deliberately not sent -
  // shop_id is enough to segment by shop, and a trading name is the vendor's
  // commercial identity.
  useEffect(() => {
    trackEvent(EVENTS.SHOP_VIEWED, { shop_id: String(initialShop._id) });
  }, [initialShop._id]);

  // Same once-a-minute refresh the shop lists use. This screen is where a
  // customer lingers before ordering, so a vendor flipping to Busy (or a
  // timed Busy lapsing) needs to reach it here too, not only on the list
  // they arrived from.
  useOpenStatusRefresh(load);

  // Open / Busy / Closed, from the backend's single computed answer -
  // the same resolver Home, Find Shops and Checkout read.
  const availability = shopAvailability(shop);
  const closed = availability.isClosed;
  const distanceLabel = formatDistance(shop.distance_km);
  const area = shop.locality || shop.address;
  const canOpenMap = !DEMO_MODE;
  const pricing = shop.pricing;
  const hasA3Rate = pricing?.paper_size_rates?.A3 > 0;
  const hasDuplexRate = pricing?.sides_extra_rate > 0;
  // Whatever THIS shop offers, under its own names - there is no fixed
  // set of services any more. A disabled one isn't orderable, so it isn't
  // shown.
  const enabledServices = (pricing?.services || []).filter(
    (s) => s.enabled !== false,
  );

  const maps = shopMaps(shop);
  useEffect(() => setMapError(false), [maps.embed]);

  const openInMaps = () => {
    Linking.openURL(maps.url).catch(() =>
      setError("Couldn't open Google Maps. Please try again."),
    );
  };

  const call = () => shop.contact && Linking.openURL(`tel:${shop.contact}`);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // Clears the sticky footer AND the home indicator, so the last
          // price row is never trapped underneath either.
          { paddingBottom: FOOTER_BASE + insets.bottom + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* --- hero ---------------------------------------------------- */}
        <View style={styles.hero}>
          <ShopPhoto
            source={shopImageSource(shop)}
            shopName={shop.shop_name}
            style={styles.heroPhoto}
            iconSize={44}
          />

          {/* Darkens only the lower band, so the chips sitting on it stay
              legible over a bright storefront without dulling the photo. */}
          <LinearGradient
            colors={["transparent", "rgba(18,51,38,0.55)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />

          {/* Chips over the photo, not a separate row below it - this is
              the first thing to know about a shop and it belongs on the
              picture of it. */}
          <ShopStatusChips shop={shop} style={styles.heroChips} />
        </View>

        {/* Floating controls. The back button and the heart are the only
            things drawn over the photo - nothing else belongs there. */}
        <View style={styles.heroControls} pointerEvents="box-none">
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.circleButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={colors.textPrimary}
            />
          </Pressable>
          <SavedShopHeart shop={shop} overlay />
        </View>

        {/* --- identity ------------------------------------------------ */}
        <View style={styles.body}>
          <Text style={styles.name}>{shop.shop_name}</Text>

          {/* Only what the API actually sends. There is no rating field on
              a shop anywhere in this backend, so no stars are drawn -
              inventing one would be a made-up endorsement of a real
              business. Distance appears once location is shared. */}
          <View style={styles.metaRow}>
            {distanceLabel ? (
              <>
                <Ionicons
                  name="navigate-outline"
                  size={13}
                  color={colors.primaryDeep}
                />
                {/* formatDistance already ends in "away" ("0.1 km away"),
                    so nothing is appended here - doing so printed
                    "0.1 km away away". */}
                <Text style={styles.metaStrong}>{distanceLabel}</Text>
                {area ? <Text style={styles.metaDot}>·</Text> : null}
              </>
            ) : null}
            {area ? (
              <>
                <Ionicons
                  name="location-outline"
                  size={13}
                  color={colors.textMuted}
                />
                <Text style={styles.meta} numberOfLines={2}>
                  {area}
                </Text>
              </>
            ) : null}
          </View>

          {/* --- pricing ------------------------------------------------ */}
          {pricing ? (
            <View style={styles.priceBlock}>
              <View style={styles.priceLine}>
                <Text style={styles.priceBig}>₹{pricing.rate_per_page_bw}</Text>
                <Text style={styles.priceBigUnit}>B&W page</Text>
                <Text style={styles.colourPill}>
                  Colour ₹{pricing.rate_per_page_color}
                </Text>
              </View>
              {/* Rates, not a quote: the platform fee and real maths land
                  at checkout. */}
              <Text style={styles.priceCaption}>
                Platform fee added at checkout.
              </Text>
            </View>
          ) : loading ? (
            <ActivityIndicator
              color={colors.primaryBright}
              style={styles.sectionLoading}
            />
          ) : null}

          {/* Short, and never an error: busy means this shop is open
              for business and working through a queue. Stated once,
              here, where a customer reads the shop's name. */}
          {availability.isBusy ? (
            <View style={styles.busyNote}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: availability.colors.dot },
                ]}
              />
              <Text style={styles.busyText}>
                <Text style={styles.busyStrong}>Busy right now. </Text>
                Prints may take about {availability.prepMinutes} min.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* --- quick actions ---------------------------------------- */}
          {canOpenMap || shop.contact ? (
            <View style={styles.actionRow}>
              {canOpenMap ? (
                <ActionButton
                  icon="map-outline"
                  label="View on map"
                  onPress={openInMaps}
                />
              ) : null}
              {shop.contact ? (
                <ActionButton icon="call-outline" label="Call" onPress={call} />
              ) : null}
            </View>
          ) : null}

          {/* --- hours ------------------------------------------------- */}
          {/* business_hours is sent by GET /shops/:id only when the shop
              runs a schedule. Without one, the live status on the photo is
              the whole answer - inventing "9 to 9" would not be true. */}
          {shop.business_hours ? (
            <Card style={styles.tightCard}>
              <View style={styles.hoursRow}>
                <View style={styles.iconDisc}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={colors.primaryBright}
                  />
                </View>
                <View style={styles.hoursText}>
                  <Text style={styles.cardTitle}>Open today</Text>
                  <Text style={styles.cardSub}>
                    {`${shop.business_hours.open_time} – ${shop.business_hours.close_time}`}
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          {hasA3Rate || hasDuplexRate ? (
            <>
              <Text style={styles.sectionTitle}>Other charges</Text>
              <Card>
                {hasA3Rate ? (
                  <PriceRow
                    first
                    label="A3 paper"
                    value={`+₹${pricing.paper_size_rates.A3}`}
                    unit="/ page"
                  />
                ) : null}
                {hasDuplexRate ? (
                  // A rupee amount per page, not a percentage the customer
                  // would have to apply to a subtotal they cannot see yet.
                  <PriceRow
                    first={!hasA3Rate}
                    label="Double-sided"
                    value={`+₹${pricing.sides_extra_rate}`}
                    unit="/ page"
                  />
                ) : null}
              </Card>
            </>
          ) : null}

          {/* --- owner ------------------------------------------------- */}
          {/* One compact row, not a panel: it is a reassurance, not a
              section. Shown only when the vendor actually uploaded a
              photo of themselves. */}
          {shop.owner_photo_url ? (
            <Card style={styles.tightCard}>
              <View style={styles.ownerRow}>
                <Image
                  source={{ uri: shop.owner_photo_url }}
                  style={styles.ownerPhoto}
                />
                <View style={styles.hoursText}>
                  <Text style={styles.cardTitle}>Shop owner</Text>
                  <Text style={styles.cardSub}>
                    Ask for them at the counter.
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          {/* --- where to find it -------------------------------------- */}
          {shop.address || maps.embed ? (
            <>
              <Text style={styles.sectionTitle}>Where to find it</Text>
              <Card>
                {shop.address ? (
                  <View style={styles.addressRow}>
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={colors.primaryDeep}
                    />
                    <Text style={styles.addressText}>{shop.address}</Text>
                  </View>
                ) : null}

                {maps.embed ? (
                  <>
                    <View style={styles.mapBox} pointerEvents="none">
                      {mapError ? (
                        <Text style={styles.emptyNote}>
                          Map couldn't load. Open Google Maps below to see the
                          location.
                        </Text>
                      ) : (
                        <WebView
                          source={{
                            html: googleMapHtml(maps.embed),
                            baseUrl: "https://www.google.com",
                          }}
                          style={styles.map}
                          scrollEnabled={false}
                          originWhitelist={["*"]}
                          onError={() => setMapError(true)}
                          onHttpError={() => setMapError(true)}
                          accessibilityLabel={`${shop.shop_name} location on Google Maps`}
                        />
                      )}
                    </View>
                    <Button
                      title="Open Google Maps"
                      disabled={DEMO_MODE}
                      variant="secondary"
                      icon="open-outline"
                      onPress={openInMaps}
                      style={styles.mapButton}
                    />
                  </>
                ) : null}
              </Card>
            </>
          ) : null}

          {/* --- pricing ------------------------------------------------ */}
          {pricing ? (
            <>
              <Text style={styles.sectionTitle}>Additional services</Text>
              <Card>
                {enabledServices.length > 0 ? (
                  enabledServices.map((service, i) => (
                    <PriceRow
                      key={service._id || service.name}
                      label={service.name}
                      value={`₹${service.rate}`}
                      unit="/ document"
                      first={i === 0}
                    />
                  ))
                ) : (
                  <Text style={styles.emptyNote}>
                    This shop doesn&apos;t offer additional finishing.
                  </Text>
                )}
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky, and lifted by the device's own bottom inset so it clears
          the home indicator instead of sitting under it. */}
      <View
        style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}
      >
        {pricing && !closed ? (
          <View>
            <Text style={styles.footerPrice}>₹{pricing.rate_per_page_bw}</Text>
            <Text style={styles.footerUnit}>per B&W page</Text>
          </View>
        ) : null}
        <Button
          title={closed ? "Shop is closed right now" : "Print here"}
          icon={closed ? undefined : "arrow-forward"}
          disabled={closed}
          style={styles.footerButton}
          onPress={() =>
            navigation.navigate("PrintFlow", {
              screen: "UploadDocuments",
              params: { preselectedShop: shop },
            })
          }
        />
      </View>
    </View>
  );
}

// Enough room for the button plus its padding; the inset is added on top
// at both ends (footer padding and scroll clearance) so the two can never
// drift apart.
const FOOTER_BASE = 84;

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function ActionButton({ icon, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={17} color={colors.primaryBright} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Label left, price right, with the unit set quieter than the amount so a
// column of prices scans as numbers rather than sentences.
function PriceRow({ label, value, unit, first }) {
  return (
    <View style={[styles.priceRow, !first && styles.priceRowBorder]}>
      <Text style={styles.priceLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.priceValue}>
        {value}
        <Text style={styles.priceUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxl },

  // --- hero ---------------------------------------------------------
  hero: {
    height: HERO_HEIGHT,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    overflow: "hidden",
    borderRadius: 24,
  },
  heroPhoto: {
    height: HERO_HEIGHT,
    borderRadius: 0,
  },
  heroScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  heroChips: {
    position: "absolute",
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroControls: {
    position: "absolute",
    top: spacing.lg + spacing.sm,
    left: spacing.lg + spacing.md,
    right: spacing.lg + spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  pressed: { opacity: 0.7 },

  // Informational, not a warning: a soft amber field with no border and
  // no icon, sitting inline under the shop's name.
  busyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: availabilityColors.busy.bg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  busyText: {
    flex: 1,
    minWidth: 0,
    ...typography.caption,
    color: availabilityColors.busy.text,
  },
  busyStrong: { fontFamily: fonts.headingBold },
  dot: { width: 7, height: 7, borderRadius: radius.pill },

  // --- body ---------------------------------------------------------
  body: { padding: spacing.lg, paddingTop: spacing.lg },
  name: { ...typography.h1, color: colors.textPrimary },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: spacing.xs,
  },
  metaStrong: { ...typography.bodySmall, color: colors.primaryDeep },
  metaDot: { ...typography.bodySmall, color: colors.textMuted },
  meta: { ...typography.bodySmall, color: colors.textSecondary, flexShrink: 1 },
  error: {
    ...typography.bodySmall,
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },

  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  actionButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primaryBright,
  },

  // --- cards ---------------------------------------------------------
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  tightCard: { marginTop: spacing.md, padding: spacing.md },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLoading: { marginTop: spacing.xl },
  cardTitle: { ...typography.labelSmall, color: colors.textPrimary },
  cardSub: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  hoursRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  hoursText: { flex: 1, minWidth: 0 },
  iconDisc: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ownerPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryWash,
  },

  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  addressText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  mapBox: {
    height: 230,
    borderRadius: radius.md,
    overflow: "hidden",
    marginTop: spacing.md,
    backgroundColor: colors.leafSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { flex: 1, backgroundColor: colors.leafSoft },
  mapButton: { marginTop: spacing.md },
  emptyNote: { ...typography.bodySmall, color: colors.textMuted },

  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  priceRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  priceLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  priceValue: {
    fontFamily: fonts.headingBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  priceUnit: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  priceBlock: { marginTop: spacing.md, gap: spacing.xs },
  priceLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: spacing.sm,
  },
  priceBig: {
 ...typography.h2,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  priceBigUnit: { ...typography.bodySmall, color: colors.textSecondary },
  colourPill: {
    ...typography.caption,
    color: colors.textSecondary,
 backgroundColor: colors.backgroundSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    overflow: "hidden",
  },
  priceCaption: { ...typography.caption, color: colors.textMuted },

  footerPrice: {
    ...typography.h3,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  footerUnit: { ...typography.caption, color: colors.textSecondary },
  footerButton: { flex: 1 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.sheet,
  },
});
