import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import Card, { CardHeader } from "../components/Card";
import CartItem from "../components/CartItem";
import OrderJourney from "../components/OrderJourney";
import OtpCard from "../components/OtpCard";
import PriceBreakdown from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import api from "../api/client";
import useFocusedPoll from "../hooks/useFocusedPoll";
import { orderRef } from "../utils/orderRef";
import { successHaptic } from "../utils/haptics";
import { colors, typography, spacing, radius } from "../theme";

const ORDER_POLL_MS = 20 * 1000;

// Status label + colour for the badge beside the title. Driven entirely
// by the backend's own status values - no state is invented here.
const STATUS_META = {
  pending: {
    label: "In progress",
    bg: colors.primaryWash,
    text: colors.primaryDeep,
  },
  accepted: {
    label: "In progress",
    bg: colors.primaryWash,
    text: colors.primaryDeep,
  },
  ready_for_pickup: {
    label: "Ready for pickup",
    bg: colors.successBg,
    text: colors.success,
  },
  completed: { label: "Completed", bg: colors.successBg, text: colors.success },
  cancelled: { label: "Cancelled", bg: colors.dangerBg, text: colors.danger },
  expired: {
    label: "Expired",
    bg: colors.backgroundSoft,
    text: colors.textSecondary,
  },
};

// One screen for the whole life of an order: tracking while it is live,
// and the completed-order / history view once it is not. They share a
// summary, a bill and a shop card, so splitting them into two screens
// would mean maintaining the same thing twice.
export default function OrderTrackingScreen({ route, navigation }) {
  const { order: initialOrder } = route.params;
  const [order, setOrder] = useState(initialOrder);
  const [refreshing, setRefreshing] = useState(false);

  const status = order.status;
  const isClosed = status === "cancelled" || status === "expired";
  const isCompleted = status === "completed";
  const meta = STATUS_META[status] || STATUS_META.pending;
  const otpStillNeeded = !isClosed && !isCompleted && order.otp;
  const otpReady = otpStillNeeded && status === "ready_for_pickup";

  const showQueuePosition =
    (status === "pending" || status === "accepted") &&
    typeof order.queue_position === "number";

  const shareDetails = () => {
    Share.share({
      message: `My Paprout order\nOrder: ${orderRef(order)}\nPickup code: ${order.otp}`,
    });
  };

  const onRefresh = async ({ silent } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await api.get("/orders/customer");
      const updated = data.find((o) => o._id === order._id);
      if (updated) {
        const wasReady = order.status === "ready_for_pickup";
        if (!wasReady && updated.status === "ready_for_pickup") {
          successHaptic();
          navigation.replace("PickupOtp", { order: updated });
          return;
        }
        setOrder(updated);
      }
    } catch {
      // Silent - a failed refresh leaves the last known status shown.
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  const isLive = ["pending", "accepted", "ready_for_pickup"].includes(status);
  const pollStatus = useCallback(
    () => onRefresh({ silent: true }),
    [order._id, order.status],
  );
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
          onPress: () =>
            navigation.navigate("PrintFlow", {
              screen: "UploadDocuments",
              params: { preselectedShop: order.shop_id },
            }),
        },
      ],
    );
  };

  const priceRows = [
    { label: "Subtotal", value: order.base_subtotal ?? 0 },
    order.paper_size_charge > 0
      ? { label: "Paper size", value: order.paper_size_charge }
      : null,
    order.sides_charge > 0
      ? { label: "Double-sided", value: order.sides_charge }
      : null,
    order.services_charge > 0
      ? { label: "Additional services", value: order.services_charge }
      : null,
    { label: "Platform fee", value: order.platform_fee ?? 0 },
    { label: "Pickup", free: true },
  ];

  return (
    <ScreenBackground>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryBright}
          />
        }
      >
        {!otpStillNeeded ? (
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>
                {isCompleted ? "Order details" : "Track your order"}
              </Text>
              <Text style={styles.ref}>Order {orderRef(order)}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.badgeText, { color: meta.text }]}>
                {meta.label}
              </Text>
            </View>
          </View>
        ) : null}

        {otpReady ? (
          <OtpCard
            otp={order.otp}
            reference={orderRef(order)}
            shopName={order.shop_id?.shop_name}
            caption="Show this code at the counter"
          />
        ) : null}

        {isClosed ? (
          <Card style={styles.card}>
            <Text style={styles.closedText}>
              {status === "expired"
                ? "This order expired. Upload your files again to reorder."
                : "This order was cancelled."}
            </Text>
          </Card>
        ) : (
          <OrderJourney status={status} />
        )}

        {showQueuePosition ? (
          <View style={styles.queueBox}>
            <Ionicons
              name="people-outline"
              size={16}
              color={colors.primaryDeep}
            />
            <Text style={styles.queueText}>
              {order.queue_position === 0
                ? "You're next in line"
                : `${order.queue_position} order${order.queue_position === 1 ? "" : "s"} ahead of you`}
            </Text>
          </View>
        ) : null}

        {otpStillNeeded && !otpReady ? (
          <OtpCard
            compact
            otp={order.otp}
            caption="You'll need this code at pickup"
          />
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
            <PriceBreakdown
              rows={priceRows}
              total={order.total_amount ?? 0}
              totalLabel="Total paid"
              compact
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <CardHeader title="Order info" />
          <InfoRow
            label="Placed on"
            value={new Date(order.createdAt).toLocaleString("en-IN")}
          />
          <InfoRow
            label="Reference"
            value={order.is_demo ? orderRef(order) : String(order._id)}
          />
          {order.instructions ? (
            <InfoRow label="Notes" value={order.instructions} />
          ) : null}
        </Card>

        {/* "Need help with this order?" stays available on every order,
            closed ones included - those are the ones people most need
            help with. */}
        <Pressable
          style={({ pressed }) => [
            styles.helpRow,
            pressed && styles.helpRowPressed,
          ]}
          onPress={() =>
            navigation.navigate("Chat", {
              orderContext: { order_id: order._id },
              draft: `Hi, I need help with my order${
                order.shop_id?.shop_name ? ` at ${order.shop_id.shop_name}` : ""
              } (${orderRef(order)}). `,
            })
          }
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={18}
            color={colors.primaryBright}
          />
          <Text style={styles.helpText}>Need help with this order?</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.primaryBright}
          />
        </Pressable>

        {otpStillNeeded ? (
          <Button
            title="Share code"
            variant="secondary"
            onPress={shareDetails}
            style={styles.action}
          />
        ) : null}

        {isCompleted ? (
          <View style={styles.completedActions}>
            <Button title="Reorder" onPress={reorder} />
          </View>
        ) : null}
      </ScrollView>
    </ScreenBackground>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1 },
  title: { ...typography.h1, color: colors.textPrimary },
  ref: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  badge: {
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    marginTop: 6,
  },
  badgeText: { ...typography.labelSmall },

  card: { marginBottom: spacing.md },
  sectionLabel: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  closedText: { ...typography.bodySmall, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border },
  summaryFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

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
