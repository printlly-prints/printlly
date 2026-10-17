import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import api from "../api/client";
import Avatar from "../components/Avatar";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import ScreenFrame from "../components/ScreenFrame";
import { isAwaitingPayment, navigateToOrder } from "../utils/orderNavigation";
import { pickupCodeForOrder } from "../utils/orderState";
import useFocusedPoll from "../hooks/useFocusedPoll";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography, radius, statusLabels } from "../theme";

const ACTIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];
export default function MyOrdersScreen({ navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [orders, setOrders] = useState([]), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState("");
  const [failure, setFailure] = useState(null);
  const [tab, setTab] = useState("active");
  const mounted = useRef(true), requestId = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current += 1; }; }, []);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    try { const { data } = await api.get("/orders/customer"); if (mounted.current && id === requestId.current) { setOrders(Array.isArray(data) ? data : []); setError(""); setFailure(null); } }
    catch (err) { if (mounted.current && id === requestId.current) { setFailure(err); setError("Could not refresh orders."); } }
    finally { if (mounted.current && id === requestId.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useFocusedPoll(load, 20000);
  const visible = orders.filter(order => tab === "active" ? ACTIVE_STATUSES.includes(order.status) : !ACTIVE_STATUSES.includes(order.status));
  const empty = !loading && !error && visible.length === 0;
  return <ScreenFrame title="Your orders" scroll={false} contentStyle={styles.frame} accessory={<Pressable onPress={() => navigation.navigate("Profile")} accessibilityRole="button" accessibilityLabel="Your profile" style={styles.avatarButton}><Avatar size={40} decorative /></Pressable>}>
    {!empty || orders.length > 0 ? <View style={styles.tabs}>{[["active", "Active"], ["past", "Past"]].map(([value, label]) => <Pressable key={value} style={[styles.tab, tab === value && styles.selectedTab]} onPress={() => setTab(value)} accessibilityRole="tab" accessibilityState={{ selected: tab === value }}><Text style={[styles.tabLabel, tab === value && { color: colors.action }]}>{label}</Text></Pressable>)}</View> : null}
    <FlatList style={styles.list} contentContainerStyle={styles.listContent} data={visible} keyExtractor={order => String(order._id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.action} />}
      ListHeaderComponent={error ? <RecoveryState compact {...recoveryForError(failure)} retryKey={failure} message={orders.length ? "Showing your last confirmed orders. Retry to check their current status." : recoveryForError(failure).message} primaryLabel="Try again" onPrimary={() => { setRefreshing(true); load(); }} loading={refreshing} /> : null}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={colors.action} /><Text style={styles.note}>Loading your orders…</Text></View> : !error ? <View style={styles.empty}>{orders.length === 0 ? <><View style={styles.emptyHeading}><View style={styles.documentIcon}><Ionicons name="document-text-outline" size={28} color={colors.action} /></View><Text style={styles.headline}>Your first print{"\n"}is waiting.</Text></View><Text style={styles.intro}>Upload a PDF or image to get started.</Text><Button title="Upload files" onPress={() => navigation.navigate("UploadDocuments")} /></> : <><Text style={styles.emptyTitle}>{tab === "active" ? "No active orders" : "No past orders"}</Text><Text style={styles.note}>{tab === "active" ? "Your current orders will appear here." : "Collected, cancelled and expired orders appear here."}</Text></>}</View> : null}
      renderItem={({ item }) => {
        const unresolved = isAwaitingPayment(item), files = item.documents?.length || 0;
        const display = unresolved ? item.payment_status === "failed" ? "Payment not completed" : "Payment pending" : statusLabels[item.status] || item.status;
        const date = new Date(item.createdAt), stamp = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        const body = <><View style={styles.copy}><Text style={styles.shopName}>{item.shop_id?.shop_name || "Print shop"}</Text><Text style={styles.note}>{[display, `${files} file${files === 1 ? "" : "s"}`, typeof item.total_amount === "number" ? `₹${item.total_amount}` : null].filter(Boolean).join(" · ")}</Text>{tab === "past" && stamp ? <Text style={styles.note}>{stamp}</Text> : null}</View><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></>;
        if (unresolved) return <View style={styles.card}><View style={styles.row}>{body}</View><Text style={styles.paymentNote}>Check the current payment status before trying again if money was deducted.</Text><Button title="Check payment" variant="secondary" onPress={() => navigateToOrder(navigation, item)} /></View>;
        const hint = item.status === "ready_for_pickup" && pickupCodeForOrder(item) ? "View pickup ticket" : "View order details";
        return <Pressable style={({ pressed }) => [styles.card, styles.row, pressed && styles.pressed]} onPress={() => navigateToOrder(navigation, item)} accessibilityRole="button" accessibilityLabel={`${item.shop_id?.shop_name || "Print shop"}, ${display}, ${hint}`}>{body}</Pressable>;
      }} />
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  frame: { padding: 0 }, avatarButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }, tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 24, paddingTop: 24 },
  tab: { flex: 1, minHeight: 48, padding: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderRadius: radius.button }, selectedTab: { backgroundColor: colors.selection }, tabLabel: { ...typography.bodySmall, color: colors.textSecondary },
  list: { flex: 1 }, listContent: { padding: 24, paddingTop: 20, gap: 16, flexGrow: 1 }, card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, minHeight: 72, gap: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 12 }, copy: { flex: 1 },
  shopName: { ...typography.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textPrimary }, note: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, pressed: { backgroundColor: colors.selection },
  paymentNote: { ...typography.caption, color: colors.textSecondary }, empty: { gap: 16, paddingTop: 8, paddingBottom: 24 }, emptyHeading: { flexDirection: "row", alignItems: "flex-start", gap: 16 }, documentIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.selection, alignItems: "center", justifyContent: "center", marginTop: 6 }, headline: { ...typography.h1, flex: 1, color: colors.textPrimary }, intro: { ...typography.body, color: colors.textSecondary }, emptyTitle: { ...typography.h3, color: colors.textPrimary },
  errorBox: { backgroundColor: colors.errorSurface, padding: 16, borderRadius: radius.md, gap: 12 }, error: { ...typography.bodySmall, color: colors.error },
});
