import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import Button from "../components/Button";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import Card, { CardHeader } from "../components/Card";
import CartItem from "../components/CartItem";
import OrderTimeline from "../components/OrderTimeline";
import OtpCard from "../components/OtpCard";
import PriceBreakdown from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import api from "../api/client";
import useFocusedPoll from "../hooks/useFocusedPoll";
import { orderRef } from "../utils/orderRef";
import { pickupCodeForOrder } from "../utils/orderState";
import { typography, spacing, radius } from "../theme";
import ScreenFrame from "../components/ScreenFrame";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { navigateToOrder } from "../utils/orderNavigation";

const ORDER_POLL_MS = 20 * 1000;

// Status label + colour for the badge beside the title. Driven entirely
// by the backend's own status values - no state is invented here.
const statusMetadata = (colors) => ({
  pending: { label: "Awaiting acceptance", bg: colors.primaryWash, text: colors.primaryDeep },
  accepted: { label: "Shop accepted", bg: colors.primaryWash, text: colors.primaryDeep },
  ready_for_pickup: { label: "Ready for pickup", bg: colors.successBg, text: colors.success },
  completed: { label: "Completed", bg: colors.successBg, text: colors.success },
  cancelled: { label: "Cancelled", bg: colors.dangerBg, text: colors.danger },
  expired: { label: "Expired", bg: colors.backgroundSoft, text: colors.textSecondary },
});

// One screen for the whole life of an order: tracking while it is live,
// and the completed-order / history view once it is not. They share a
// summary, a bill and a shop card, so splitting them into two screens
// would mean maintaining the same thing twice.
export default function OrderTrackingScreen({ route, navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles), STATUS_META = statusMetadata(colors);
  const { order: initialOrder } = route.params;
  const [order, setOrder] = useState(initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const mounted = useRef(true);
  const requestId = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current += 1; }; }, []);

  const status = order.status;
  const isClosed = status === "cancelled" || status === "expired";
  const isCompleted = status === "completed";
  const meta = !isClosed && !isCompleted && order.payment_status !== "paid" ? { ...STATUS_META.pending, label: "Payment pending" } : STATUS_META[status] || STATUS_META.pending;
  const pickupCode = pickupCodeForOrder(order);

  const showQueuePosition =
    (status === "pending" || status === "accepted") && typeof order.queue_position === "number";

  const shareDetails = () => {
    if (!pickupCode) return;
    Share.share({ message: `My Printlly order\nOrder: ${orderRef(order)}\nPickup OTP: ${pickupCode}` });
  };

  const onRefresh = async ({ silent } = {}) => {
    const id = ++requestId.current;
    if (!silent) setRefreshing(true);
    try {
      const { data } = await api.get("/orders/customer");
      if (!mounted.current || id !== requestId.current) return;
      setConnectionError(null);
      const updated = data.find((o) => o._id === order._id);
      if (!updated) { navigation.replace("NotFound"); return; }
      if (updated) {
        const wasReady = order.status === "ready_for_pickup";
        if (!wasReady && updated.status === "ready_for_pickup" && pickupCodeForOrder(updated)) {
          navigation.replace("PickupOtp", { order: updated });
          return;
        }
        setOrder(updated);
      }
    } catch (error) {
      if (mounted.current && id === requestId.current) setConnectionError(error);
    } finally {
      if (mounted.current && id === requestId.current) setRefreshing(false);
    }
  };

  const isLive = ["pending", "accepted", "ready_for_pickup"].includes(status);
  const refreshRef = useRef(onRefresh); refreshRef.current = onRefresh;
  useFocusEffect(useCallback(() => { refreshRef.current({ silent: true }); }, [order._id]));
  const pollStatus = useCallback(() => onRefresh({ silent: true }), [order._id, order.status]);
  useFocusedPoll(isLive ? pollStatus : null, ORDER_POLL_MS);

  // Reorder: the same shop, a fresh upload. It cannot carry the original
  // FILES forward - a completed order's documents are deleted from
  // storage on completion, by design (see utils/documentCleanup.js), so
  // there is nothing left to re-print. What it can reuse is the shop, so
  // that is what it does, and it says so rather than implying more.
  const reorder = () => {
    Alert.alert(
      "Reorder",
      `Your files from this order were deleted after collection, as we promise. Upload them again to reprint at ${order.shop_id?.shop_name || "this shop"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload files",
          onPress: () => navigation.navigate("UploadDocuments", { preselectedShop: order.shop_id }),
        },
      ]
    );
  };

  const priceRows = [
    { label: "Subtotal", value: order.base_subtotal },
    order.paper_size_charge > 0 ? { label: "Paper size", value: order.paper_size_charge } : null,
    order.sides_charge > 0 ? { label: "Double-sided", value: order.sides_charge } : null,
    order.services_charge > 0 ? { label: "Additional services", value: order.services_charge } : null,
    { label: "Platform fee", value: order.platform_fee },
    { label: "Pickup", free: true },
  ];

  return (
    <ScreenFrame title="Order status" onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("MainTabs", { screen: "Orders" })}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.action} />}
      footer={pickupCode ? <Button title="View pickup code" onPress={() => navigation.navigate("PickupOtp", { order })} /> : !isClosed && !isCompleted && order.payment_status !== "paid" ? <Button title="Complete UPI payment" onPress={() => navigateToOrder(navigation, order)} /> : undefined}>
        {connectionError ? <RecoveryState compact {...recoveryForError(connectionError)} retryKey={connectionError} message="Showing the last confirmed order status. Retry to get the latest update." primaryLabel="Reconnect" onPrimary={onRefresh} loading={refreshing} /> : null}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{isCompleted ? "Order collected." : status === "accepted" ? "The shop accepted your order." : status === "ready_for_pickup" ? "Your print is ready." : isClosed ? "Order closed." : order.payment_status !== "paid" ? "Payment is pending." : "Your order is placed."}</Text>
            <Text style={styles.ref}>Order {orderRef(order)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        {isClosed ? (
          <RecoveryState compact reaction="cancelled" title={status === "expired" ? "This order has expired." : "This order was cancelled."} message={status === "expired" ? "Upload your files again to start a new order with current shop availability." : "You can choose another shop for a new order, or get help with this one."} primaryLabel="Find a print shop" onPrimary={() => navigation.navigate("MainTabs", { screen: "Shops" })} />
        ) : (
          <Card style={styles.card}>
            <OrderTimeline
              status={status}
              placedAt={order.createdAt}
              // Only stamps the order actually carries. updatedAt is the
              // last transition, so it belongs to whichever step is
              // current - not spread across every step as though each had
              // been timed.
              completedAt={isCompleted ? order.updatedAt : null}
              readyAt={status === "ready_for_pickup" ? order.updatedAt : null}
              acceptedAt={status === "accepted" ? order.updatedAt : null}
            />
          </Card>
        )}

        {showQueuePosition ? (
          <View style={styles.queueBox}>
            <Ionicons name="people-outline" size={16} color={colors.primaryDeep} />
            <Text style={styles.queueText}>
              {order.queue_position === 0
                ? "You're next in line"
                : `${order.queue_position} order${order.queue_position === 1 ? "" : "s"} ahead of you`}
            </Text>
          </View>
        ) : null}


        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Print shop</Text>
          <ShopCard shop={order.shop_id} showContact showActions />
        </View>

        <Card style={styles.card}>
          <CardHeader title="Order summary" />
          {(order.documents || []).map((doc, i) => (
            <View key={doc.upload_id || i}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <CartItem
                name={doc.original_name}
                pageCount={doc.page_count}
                settings={doc}
                copies={doc.copies}
                services={doc.services}
                total={doc.pricing?.document_total}
              />
            </View>
          ))}
          <View style={styles.summaryFooter}>
            <PriceBreakdown rows={priceRows} total={order.total_amount} totalLabel={order.payment_status === "paid" ? "Total paid" : "Order total"} compact />
          </View>
        </Card>

        <Card style={styles.card}>
          <CardHeader title="Order info" />
          <InfoRow label="Placed on" value={new Date(order.createdAt).toLocaleString("en-IN")} />
          <InfoRow label="Reference" value={String(order._id)} />
          {order.instructions ? <InfoRow label="Notes" value={order.instructions} /> : null}
        </Card>

        {/* "Need help with this order?" stays available on every order,
            closed ones included - those are the ones people most need
            help with. */}
        <Pressable
          style={({ pressed }) => [styles.helpRow, pressed && styles.helpRowPressed]}
          onPress={() =>
            navigation.navigate("Chat", {
              orderContext: { order_id: order._id },
              draft: `Hi, I need help with my order${
                order.shop_id?.shop_name ? ` at ${order.shop_id.shop_name}` : ""
              } (${orderRef(order)}). `,
            })
          }
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primaryBright} />
          <Text style={styles.helpText}>Need help with this order?</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primaryBright} />
        </Pressable>

        {pickupCode ? (
          <Button title="Share OTP" variant="secondary" onPress={shareDetails} style={styles.action} />
        ) : null}

        {isCompleted ? (
          <View style={styles.completedActions}>
            <Button title="Reorder" onPress={reorder} />
          </View>
        ) : null}
    </ScreenFrame>
  );
}

function InfoRow({ label, value }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const createStyles = ({ colors }) => ({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: "column-reverse", alignItems: "stretch", gap: spacing.md, marginBottom: spacing.lg },
  headerText: {},
  title: { ...typography.h1, color: colors.textPrimary },
  ref: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  badge: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: spacing.md },
  badgeText: { ...typography.labelSmall },

  card: { marginBottom: spacing.md },
  sectionLabel: { ...typography.label, color: colors.textPrimary, marginBottom: spacing.sm },
  closedText: { ...typography.bodySmall, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border },
  summaryFooter: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },

  queueBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryWash,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  queueText: { ...typography.label, color: colors.primaryDeep },

  infoRow: { paddingVertical: spacing.xs },
  infoLabel: { ...typography.caption, color: colors.textMuted },
  infoValue: { ...typography.bodySmall, color: colors.textPrimary },

  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primaryWash,
    marginBottom: spacing.md,
  },
  helpRowPressed: { opacity: 0.7 },
  helpText: { ...typography.label, color: colors.primaryDeep, flex: 1 },

  action: { marginTop: spacing.xs },
  completedActions: { gap: spacing.md, marginTop: spacing.xs },
});
