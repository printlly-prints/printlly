import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Image, Pressable, RefreshControl, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import ShopBrowseCard from "../components/ShopBrowseCard";
import { useAuth } from "../context/AuthContext";
import { geoParams, useLocation } from "../context/LocationContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationsContext";
import { statusLabels, typography, radius } from "../theme";
import { isAwaitingPayment, navigateToOrder } from "../utils/orderNavigation";
import api from "../api/client";
import { useOpening } from "../components/OpeningArtwork";

// Figma M06 is a launchpad. Every order here is read from the existing API.
export default function HomeScreen({ navigation }) {
  const { measureTarget, setUploadAvailable } = useOpening();
  const openingTarget = useRef(null);
  const { user } = useAuth(), { coords, ensureLocation } = useLocation(), { unreadCount } = useNotifications();
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const account = user?.id || user?._id || "";
  const [snapshot, setSnapshot] = useState({ account: "", orders: [], shops: [], errors: {} });
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const request = useRef(0), focused = useRef(false);
  const { orders, shops, errors } = snapshot.account === account ? snapshot : { orders: [], shops: [], errors: {} };
  const load = useCallback(async (refresh = false, keys = ["orders", "shops"]) => {
    const id = ++request.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    const results = await Promise.allSettled([
      ...keys.map(key => key === "orders" ? api.get("/orders/customer") : api.get("/shops", { params: geoParams(coords) })),
    ]);
    if (!focused.current || id !== request.current) return;
    setSnapshot(previous => {
      const next = previous.account === account ? { ...previous, errors: { ...previous.errors } } : { account, orders: [], shops: [], errors: {} };
      keys.forEach((key, index) => {
        delete next.errors[key];
        const result = results[index];
        if (result.status === "fulfilled" && Array.isArray(result.value.data)) next[key] = result.value.data;
        else next.errors[key] = result.reason || new Error("Unexpected response");
      });
      return next;
    });
    setLoading(false); setRefreshing(false);
  }, [account, coords]);
  useFocusEffect(useCallback(() => {
    focused.current = true; load();
    return () => { focused.current = false; request.current += 1; };
  }, [load]));
  useFocusEffect(useCallback(() => { ensureLocation(); }, [ensureLocation]));
  const fullRecovery = !loading && Boolean(errors.shops && errors.orders) && !shops.length && !orders.length;
  useEffect(() => { setUploadAvailable(!fullRecovery); }, [fullRecovery, setUploadAvailable]);
  useEffect(() => () => setUploadAvailable(false), [setUploadAvailable]);
  if (fullRecovery) {
    const recovery = recoveryForError(errors.shops);
    return <ScreenFrame title={recovery.reaction === "offline" ? "Connection unavailable" : "Temporarily unavailable"} footer={<RecoveryState actionsOnly compact style={{ marginBottom: 0 }} retryAfterSeconds={recovery.retryAfterSeconds} retryKey={errors.shops} primaryLabel="Try again" loading={refreshing} onPrimary={() => load(true)} secondaryLabel="Get help" onSecondary={() => navigation.navigate("HelpSupport")} />}>
      <RecoveryState {...recovery} retryKey={errors.shops} />
    </ScreenFrame>;
  }
  return <ScreenFrame title="Printlly" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.action} />} accessory={<Pressable accessibilityRole="button" accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} onPress={() => navigation.navigate("Notifications")} style={styles.avatarButton}>
    <Ionicons name="notifications-outline" size={25} color={colors.textPrimary} />
    {unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View> : null}
  </Pressable>}>
    <Text style={styles.headline} accessibilityRole="header">What will you{"\n"}print today?</Text>
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}><Text style={styles.heroTitle}>Ready to print?</Text><Text style={styles.heroNote}>PDFs and images, ready to print.</Text></View>
        <Image source={require("../../assets/artwork/customer_pdf_image_compact.png")} style={styles.art} resizeMode="contain" accessible={false} />
      </View>
      <View ref={openingTarget} collapsable={false} onLayout={() => measureTarget(openingTarget.current)}><Button title="Add files" onPress={() => navigation.navigate("UploadDocuments")} /></View>
    </View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{coords ? "Nearby shops" : "Print shops"}</Text><Button title="See all" variant="text" onPress={() => navigation.navigate("MainTabs", { screen: "Shops" })} /></View>
    <View style={styles.items}>{shops.slice(0, 3).map(shop => <ShopBrowseCard key={String(shop._id)} shop={shop} onPress={() => navigation.navigate("ShopDetails", { shop })} />)}</View>
    {!shops.length ? loading ? <LoadingRow label="Loading shops…" /> : !errors.shops ? <RecoveryState compact reaction="not_found" title="No shops found nearby." message="Try another area to find an available print shop." primaryLabel="Search shops" onPrimary={() => navigation.navigate("MainTabs", { screen: "Shops" })} /> : null : null}
    {errors.shops ? <RecoveryState compact {...recoveryForError(errors.shops)} retryKey={errors.shops} message={shops.length ? "Showing the last available shops. Retry to check current availability." : recoveryForError(errors.shops).message} primaryLabel="Refresh shops" onPrimary={() => load(true, ["shops"])} loading={refreshing} /> : null}
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Your orders</Text><Button title="See all" variant="text" onPress={() => navigation.navigate("MainTabs", { screen: "Orders" })} /></View>
    <View style={styles.items}>{orders.slice(0, 3).map(latest => <HomeRow key={String(latest._id)} title={latest.shop_id?.shop_name || "Print order"}
      detail={`${isAwaitingPayment(latest) ? "Payment not completed" : statusLabels[latest.status] || "Order status unavailable"} · ${latest.documents?.length || 0} file${latest.documents?.length === 1 ? "" : "s"}`}
      onPress={() => navigateToOrder(navigation, latest)} />)}</View>
    {!orders.length ? loading ? <LoadingRow label="Loading your orders…" /> : !errors.orders ? <HomeRow title="No orders yet" detail="Add your files to place your first order" onPress={() => navigation.navigate("UploadDocuments")} /> : null : null}
    {errors.orders ? <RecoveryState compact {...recoveryForError(errors.orders)} retryKey={errors.orders} message={orders.length ? "Showing your last confirmed orders. Retry to check current status." : recoveryForError(errors.orders).message} primaryLabel="Refresh orders" onPrimary={() => load(true, ["orders"])} loading={refreshing} /> : null}
  </ScreenFrame>;
}
function LoadingRow({ label }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  return <View style={styles.loading}><ActivityIndicator color={colors.action} /><Text style={styles.loadingText}>{label}</Text></View>;
}
function HomeRow({ title, detail, onPress }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.selection }]}>
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
  </Pressable>;
}
const createStyles = ({ colors }) => ({
  headline: { ...typography.h1, color: colors.textPrimary, marginBottom: 16 }, hero: { backgroundColor: colors.hero, borderRadius: radius.md, padding: 16, gap: 16, marginBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 104 }, heroTitle: { ...typography.h3, color: colors.textPrimary }, heroNote: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 8, maxWidth: 190 }, art: { width: 104, height: 104 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, padding: 16, backgroundColor: colors.surface, borderRadius: radius.md }, rowTitle: { ...typography.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textPrimary }, rowDetail: { ...typography.caption, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 16, marginBottom: 12 }, sectionTitle: { ...typography.h3, color: colors.textPrimary, flex: 1 }, items: { gap: 12 }, avatarButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", marginRight: -4 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, minHeight: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }, badgeText: { ...typography.caption, color: colors.surface, fontSize: 10 },
  loading: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 }, loadingText: { ...typography.bodySmall, color: colors.textSecondary }, errorBox: { marginTop: 12, gap: 4 }, errorText: { ...typography.bodySmall, color: colors.error },
});
