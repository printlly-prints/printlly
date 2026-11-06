import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Avatar from "../components/Avatar";
import Button from "../components/Button";
import ScreenBackground from "../components/ScreenBackground";
import StatusBadge from "../components/StatusBadge";
import SavedShopHeart from "../components/SavedShopHeart";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { geoParams, useLocation } from "../context/LocationContext";
import { formatDistanceShort } from "../utils/distance";
import { shopAvailability } from "../utils/shopAvailability";
import { isAwaitingPayment, navigateToOrder } from "../utils/orderNavigation";
import useOpenStatusRefresh from "../hooks/useOpenStatusRefresh";
import { colors, typography, fonts, spacing, radius, shadows, rushLabels } from "../theme";

const ACTIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

// A card narrow enough that roughly two fit on screen with the next one
// peeking in from the right - the peek is the only thing that tells a
// customer the row scrolls at all - and still wide enough for a shop
// name to read. The ratio does the work on mid-size phones; the clamp
// stops the card becoming a stamp at 320px or a slab on a tablet.
// The floor is 150, not the 155 the brief asks for, and only ever binds
// at 320-360px. At 155 the arithmetic below lands on 2.02-2.06 cards at
// 360/375/390 - the next card starts 4-6px before the edge, which reads
// as a row that simply ends rather than one that scrolls. 150 buys a
// 16px+ cut-off edge at every width, which is the thing the width range
// was asking for in the first place.
const SHOP_CARD_RATIO = 0.42;
const SHOP_CARD_MIN = 150;
const SHOP_CARD_MAX = 175;

// Exported so the peek can be checked as arithmetic at every phone width
// rather than eyeballed on one device: (width - row padding) / (card +
// gap) must never land on a whole number, or the next card would sit
// exactly at the edge and the row would look like it ends there.
export function shopCardWidth(width) {
  return Math.min(Math.max(Math.round(width * SHOP_CARD_RATIO), SHOP_CARD_MIN), SHOP_CARD_MAX);
}

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { coords, ensureLocation } = useLocation();
  const { width } = useWindowDimensions();

  // Derived from the viewport rather than hardcoded, so the peek holds at
  // 320px and at 430px alike.
  const cardWidth = shopCardWidth(width);

  // Prompts for location the first time only (see LocationContext). When a
  // fix arrives, coords changes, `load` below changes with it, and the
  // focus effect re-runs - so the nearby list re-sorts by real distance.
  useEffect(() => {
    ensureLocation();
  }, [ensureLocation]);

  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  // A failed request used to look exactly like "no shops exist", which is
  // what an unreachable API base URL (wrong LAN IP, server down) actually
  // produced on this screen. Say which it is.
  const [shopsError, setShopsError] = useState("");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // `silent` skips the spinners: used by the once-a-minute open/closed
  // refresh below, which shouldn't make the whole section flash while the
  // customer is looking at it.
  const load = useCallback(async ({ silent } = {}) => {
    if (!silent) {
      setShopsLoading(true);
      setOrdersLoading(true);
    }
    try {
      // With coords, the backend returns nearest first - so the first 8
      // shown below really are the nearby ones.
      const { data } = await api.get("/shops", { params: geoParams(coords) });
      setShops(data);
      setShopsError("");
    } catch (err) {
      setShops([]);
      setShopsError(
        err.response?.data?.message ||
          "Couldn't reach the server. Check your connection and try again."
      );
    } finally {
      setShopsLoading(false);
    }

    try {
      const { data } = await api.get("/orders/customer");
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [coords]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // is_currently_open is computed server-side per request, so the only way
  // a shop that just hit its closing time stops reading as open here is a
  // refetch. See the hook.
  const refreshOpenStatus = useCallback(() => load({ silent: true }), [load]);
  useOpenStatusRefresh(refreshOpenStatus);

  // Two, not three: Home is a launchpad, and the third row was pushing
  // the section below the fold without adding an answer.
  const recentOrders = orders.slice(0, 2);

  const handleTrackOrder = () => {
    const activeOrder = orders.find((o) => ACTIVE_STATUSES.includes(o.status));
    if (activeOrder) {
      navigateToOrder(navigation, activeOrder);
    } else {
      navigation.navigate("MainTabs", { screen: "Orders" });
    }
  };

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* --- brand row ---------------------------------------------- */}
        {/* The app's own identity sits above the greeting: mark, wordmark
            and the tagline, with the two account-level controls on the
            right. Notifications to the LEFT of the avatar, so the avatar
            stays the rightmost thing on every screen that has one. */}
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/paprout-mark.png")}
            style={styles.brandMark}
            resizeMode="contain"
            accessible={false}
          />
          <View style={styles.brandText}>
            <Text style={styles.brandName}>Paprout</Text>
            <Text style={styles.brandTagline} numberOfLines={1}>
              Paprout pe bhej de
            </Text>
          </View>

          <Pressable
            onPress={() => navigation.navigate("Notifications")}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.primaryDeep} />
            {/* The same unread count the Profile tab badges - one source,
                so the two can never disagree. */}
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText} numberOfLines={1}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("MainTabs", { screen: "Profile" })}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Avatar name={user?.name} size={38} />
          </Pressable>
        </View>

        {/* --- greeting ----------------------------------------------- */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting} numberOfLines={1}>
              Hello, {user?.name?.split(" ")[0] || "there"} 👋
            </Text>
            <Text style={styles.greetingSub}>Ready to print something?</Text>
          </View>
        </View>

        {/* --- hero --------------------------------------------------- */}
        {/* The artwork belongs to THIS CARD ONLY - it is not the screen's
            background (that is ScreenBackground, which draws no photo at
            all). Three layers, and the order is what stops it reading as
            a picture stuck onto a card:
              1. the illustration, cover-cropped and clipped by the card's
                 own rounded corners, so it IS the card's surface
              2. a left-to-right wash in the card's own tones - enough
                 under the words to keep them crisp, clearing away to
                 nothing over the documents
              3. the content, padded so it never crosses into the art
            The illustration's palette is the app's own mint/teal, which
            is why the seam disappears: the wash and the art meet on the
            same colours. */}
        {/* ImageBackground, not a hand-rolled absolute <Image>: it sizes
            itself from its CHILDREN and paints the picture behind them.
            An absolutely-positioned image with a percentage height inside
            an auto-height card is over-constrained - the image falls back
            to its own intrinsic size and drags the card open with it,
            which is exactly what went wrong here. */}
        <ImageBackground
          source={require("../../assets/hero-print-without-wait.jpg")}
          style={styles.heroCard}
          imageStyle={styles.heroImage}
          resizeMode="cover"
          accessible={false}
        >
          <LinearGradient
            colors={[
              "rgba(233,246,236,0.86)",
              "rgba(233,246,236,0.55)",
              "rgba(232,247,247,0)",
            ]}
            locations={[0, 0.45, 0.82]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.heroContent}>
            {/* The whole journey in four words, so what the button starts
                is obvious before it is pressed. These are the real steps:
                upload, choose a shop, it prints, you collect with the OTP. */}
            <Text style={styles.heroSteps}>Upload · Find · Print · Collect</Text>
            <Text style={styles.heroTitle}>Print without the wait.</Text>
            <Text style={styles.heroSubtitle}>
              Upload your document and we'll handle the rest.
            </Text>
            <Button
              title="Upload Document"
              icon="arrow-forward"
              onPress={() => navigation.navigate("UploadDocuments")}
            />
          </View>
        </ImageBackground>

        {/* --- quick actions ------------------------------------------ */}
        <View style={styles.quickActionsRow}>
          <QuickAction
            icon="cloud-upload-outline"
            label="Upload"
            hint="Add your files"
            onPress={() => navigation.navigate("UploadDocuments")}
          />
          <QuickAction
            icon="storefront-outline"
            label="Find Shops"
            hint="Explore nearby"
            onPress={() => navigation.navigate("MainTabs", { screen: "Shops" })}
          />
          <QuickAction
            icon="receipt-outline"
            label="My Orders"
            hint="View all orders"
            onPress={() => navigation.navigate("MainTabs", { screen: "Orders" })}
          />
          <QuickAction
            icon="navigate-outline"
            label="Track Order"
            hint="Get live updates"
            onPress={handleTrackOrder}
          />
        </View>

        {/* --- shops --------------------------------------------------- */}
        <View style={styles.sectionHeaderRow}>
          {/* Only truly "nearby" once location is shared - otherwise it's
              just the shop list, so the heading doesn't claim otherwise. */}
          <Text style={styles.sectionTitle}>{coords ? "Nearby print shops" : "Print shops"}</Text>
          <Pressable
            onPress={() => navigation.navigate("MainTabs", { screen: "Shops" })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {shopsLoading ? (
          <ActivityIndicator color={colors.primaryBright} style={styles.sectionLoading} />
        ) : shopsError ? (
          <Text style={styles.errorText}>{shopsError}</Text>
        ) : shops.length === 0 ? (
          <Text style={styles.emptyText}>No shops are available right now.</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shopScroll}
            contentContainerStyle={styles.shopScrollContent}
            snapToInterval={cardWidth + spacing.md}
            decelerationRate="fast"
          >
            {shops.slice(0, 8).map((shop) => {
              // One resolver for the shop's three-state availability,
              // shared with every other screen that shows a shop.
              const availability = shopAvailability(shop);
              const closed = availability.isClosed;
              const distanceLabel = formatDistanceShort(shop.distance_km);
              return (
                <Pressable
                  key={shop._id}
                  style={({ pressed }) => [
                    styles.shopCard,
                    { width: cardWidth },
                    closed && styles.shopCardClosed,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => navigation.navigate("ShopDetails", { shop })}
                >
                  {/* ~16:9 against the card's OWN width, so shrinking the
                      card shrinks the photo with it rather than leaving a
                      tall band sitting over two short lines of text.
                      Cover-cropped and clipped by ShopPhoto's own
                      overflow:hidden. */}
                  <ShopPhoto
                    source={shopImageSource(shop)}
                    shopName={shop.shop_name}
                    style={[styles.shopPhoto, { height: Math.round(cardWidth / 1.7) }]}
                    closed={closed}
                    iconSize={22}
                  />
                  <SavedShopHeart shop={shop} overlay style={styles.heartCorner} />

                  <View style={styles.shopBody}>
                    <Text style={styles.shopName} numberOfLines={1}>
                      {shop.shop_name}
                    </Text>

                    {/* Only facts the API actually returns. GET /shops
                        carries no rating and no pricing (the route drops
                        `pricing` on purpose - see getActiveShops), so
                        neither is shown: a "4.8 ★" here would be an
                        invented endorsement of a real business, and a
                        "₹2/page" would be a guess at what the customer
                        is about to be charged. Distance appears once
                        location is shared; open/closed and the queue's
                        rush level are always real. */}
                    <Text style={styles.shopAddress} numberOfLines={1}>
                      {[shop.locality || shop.address, distanceLabel].filter(Boolean).join("  ·  ")}
                    </Text>

                    {/* Status and its qualifier share one line as plain
                        text rather than two pills: at 150-175px a pill's
                        own padding is most of the row, and the pair
                        wrapped to a second line - which is the height
                        this card's redesign exists to remove.

                        While BUSY the preparation estimate replaces the
                        rush level: "Ready in ~25 min" is the specific
                        thing the vendor is telling this customer, and it
                        supersedes the generic queue reading. */}
                    <View style={styles.shopMetaRow}>
                      <View style={[styles.statusDot, { backgroundColor: availability.colors.dot }]} />
                      <Text
                        style={[styles.shopStatus, { color: availability.colors.text }]}
                        numberOfLines={1}
                      >
                        {[
                          availability.label,
                          availability.prepLine || rushLabels[shop.queue?.rush_level],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* --- recent orders ------------------------------------------- */}
        {/* Hidden entirely with zero orders, per spec - no "no orders yet"
            placeholder needed on the home screen specifically. */}
        {!ordersLoading && recentOrders.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent orders</Text>
              <Pressable
                onPress={() => navigation.navigate("MainTabs", { screen: "Orders" })}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>

            {recentOrders.map((order) => (
              <RecentOrderRow
                key={order._id}
                order={order}
                onPress={() => navigateToOrder(navigation, order)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

// One line per order: what it was, where, and where it has got to. The
// document name is the snapshot stored on the order itself
// (documents[].original_name), which is the only place it survives once
// the uploads are deleted on completion.
function RecentOrderRow({ order, onPress }) {
  // Same synthetic status swap as MyOrdersScreen - an order with no
  // verified payment yet has no otp and nothing to track, so it shouldn't
  // read as a plain "Pending" order.
  const paymentUnresolved = isAwaitingPayment(order);
  const displayStatus = paymentUnresolved
    ? order.payment_status === "failed"
      ? "payment_failed"
      : "payment_pending"
    : order.status;

  const docs = order.documents || [];
  const first = docs[0];
  const title = first?.original_name || "Document";
  const extra = docs.length > 1 ? ` +${docs.length - 1} more` : "";
  const pages = docs.reduce((sum, d) => sum + (d.page_count || 0), 0);
  const colour = docs.some((d) => d.color_mode === "color") ? "Colour" : "B&W";

  return (
    <Pressable
      style={({ pressed }) => [styles.orderRow, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.orderGlyph}>
        <Ionicons name="document-text-outline" size={18} color={colors.primaryDeep} />
      </View>

      <View style={styles.orderBody}>
        <Text style={styles.orderTitle} numberOfLines={1}>
          {title}
          {extra ? <Text style={styles.orderExtra}>{extra}</Text> : null}
        </Text>
        <Text style={styles.orderSub} numberOfLines={1}>
          {order.shop_id?.shop_name || "Print shop"}
          {pages ? ` · ${pages} page${pages === 1 ? "" : "s"} · ${colour}` : ""}
        </Text>
        <View style={styles.orderStatusRow}>
          <StatusBadge status={displayStatus} />
        </View>
      </View>

      <Text style={styles.orderAmount}>₹{order.total_amount ?? 0}</Text>
    </Pressable>
  );
}

// Each action is its own white card: a teal icon disc, what it does, and
// a line saying what you get. The card is what separates the four from
// the green ground behind them - as bare tiles they read as part of the
// background rather than as four things to press.
function QuickAction({ icon, label, hint, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
      onPress={onPress}
      accessibilityRole="button"
      // The hint is part of what this button promises, so a screen reader
      // gets both rather than just the heading.
      accessibilityLabel={`${label}. ${hint}`}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={19} color={colors.primaryBright} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>
        {label}
      </Text>
      {/* Two lines allowed: "Get live updates" cannot fit one line in a
          quarter of a 320px screen, and wrapping reads better than an
          ellipsis that hides half the sentence. */}
      <Text style={styles.quickActionHint} numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  // The tab bar is laid out below this screen rather than over it, so the
  // content area is already inset by its height; this is breathing room
  // under the last card, not a clearance hack.
  content: { padding: spacing.lg, paddingBottom: spacing.xl },

  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandMark: { width: 30, height: 27 },
  // flex: 1 with minWidth: 0 so a long tagline ellipsises rather than
  // pushing the bell and avatar off the right edge at 320px.
  brandText: { flex: 1, minWidth: 0, marginLeft: 2 },
  brandName: { ...typography.h3, color: colors.textPrimary, lineHeight: 22 },
  brandTagline: { ...typography.caption, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: { opacity: 0.6, transform: [{ scale: 0.95 }] },
  bellBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: {
    fontFamily: fonts.headingBold,
    fontSize: 9.5,
    lineHeight: 12,
    color: colors.surface,
  },

  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  headerText: { flex: 1, minWidth: 0 },
  greeting: { ...typography.h2, color: colors.textPrimary },
  greetingSub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 1 },
  pressed: { opacity: 0.6 },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },

  heroCard: {
    borderRadius: 20,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    // Clips the illustration to the card's corners - without it the
    // image's square edges would show through the rounding.
    overflow: "hidden",
    // A floor under the artwork, so the card is never briefly a
    // transparent hole while the image decodes.
    backgroundColor: colors.leafSoft,
    ...shadows.card,
  },
  // imageStyle on ImageBackground: only the picture's own corner radius
  // goes here, so it follows the card's rounding. No width/height - the
  // component handles that, and setting them is what broke this before.
  heroImage: { borderRadius: 20 },
  // paddingRight is a percentage, not a fixed inset: the text column and
  // the button keep clear of the documents at 320px and at 430px alike,
  // rather than the button creeping over them on a narrow screen.
  heroContent: { padding: spacing.xl, paddingRight: "36%" },
  heroSteps: {
    ...typography.caption,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.primaryDeep,
    marginBottom: spacing.sm,
  },
  heroTitle: { ...typography.h2, color: colors.textPrimary },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },

  // alignItems: stretch so all four cards take the height of the tallest,
  // rather than the one with a two-line hint standing proud of the rest.
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  // flex: 1 with minWidth: 0 - four equal cards that divide the row
  // exactly, at any screen width, with the text allowed to wrap or
  // ellipsise rather than push its neighbours off the edge.
  quickAction: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    ...shadows.card,
  },
  quickActionPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontFamily: fonts.headingBold,
    fontSize: 11.5,
    lineHeight: 15,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  quickActionHint: {
    fontFamily: fonts.bodyRegular,
    fontSize: 9.5,
    lineHeight: 12,
    color: colors.textMuted,
    marginTop: 1,
    textAlign: "center",
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  seeAll: { ...typography.labelSmall, color: colors.primaryBright },
  sectionLoading: { marginVertical: spacing.lg },
  emptyText: { ...typography.body, color: colors.textSecondary },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
  },

  // Bleeds to both screen edges so the row reads as scrollable, while the
  // first card still lines up with the content above it.
  shopScroll: { marginHorizontal: -spacing.lg },
  shopScrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  shopCard: {
    position: "relative",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.md,
    overflow: "hidden",
    ...shadows.card,
  },
  shopPhoto: { borderRadius: 0 },
  shopBody: { padding: spacing.md },
  shopCardClosed: { opacity: 0.65 },
  heartCorner: { position: "absolute", top: spacing.sm, right: spacing.sm },
  // Sized below the shared type scale on purpose: `typography.label` is
  // 15/20, which is a third of this card's text block on its own. These
  // three lines total 46px of line box instead of 62px.
  shopName: { fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 18, color: colors.textPrimary },
  shopAddress: {
    fontFamily: fonts.bodyRegular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // No flexWrap: everything on this row is clamped to one line, so
  // wrapping could only ever be a symptom of overflow, not a fix for it.
  shopMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: spacing.xs,
  },
  // Colour is applied inline from shopAvailability() - open, busy and
  // closed each have their own, and busy must never be red.
  statusDot: { width: 6, height: 6, borderRadius: radius.pill },
  shopStatus: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },

  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  orderGlyph: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBody: { flex: 1, minWidth: 0 },
  orderTitle: { ...typography.labelSmall, color: colors.textPrimary },
  orderExtra: { ...typography.caption, color: colors.textMuted },
  orderSub: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  orderStatusRow: { flexDirection: "row", marginTop: spacing.xs },
  orderAmount: { ...typography.label, color: colors.textPrimary },
});
