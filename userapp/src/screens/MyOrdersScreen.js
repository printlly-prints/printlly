import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import PrintState from "../components/PrintState";
import OrderJourney from "../components/OrderJourney";
import Ionicons from "@expo/vector-icons/Ionicons";
import { orderRef } from "../utils/orderRef";
import StatusBadge from "../components/StatusBadge";
import api from "../api/client";
import {
  isAwaitingPayment,
  navigateToOrder,
  pickLiveOrders,
} from "../utils/orderNavigation";
import useFocusedPoll from "../hooks/useFocusedPoll";
import { colors, typography, spacing, radius } from "../theme";

// Matches OrderTrackingScreen - the vendor's actions are what move an
// order, and nothing pushes that to the app.
const ORDER_POLL_MS = 20 * 1000;

const ACTIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

// Order history from GET /orders/customer, split client-side into Active
// and Completed tabs (pending/accepted/ready_for_pickup vs completed -
// cancelled and expired orders are grouped into Completed too, as
// "no longer active"). Reloads every time the screen comes into focus so
// a status changed by the shop shows up on return.
export default function MyOrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("active");

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/orders/customer");
      setOrders(data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  // Status here changes on the vendor's side (accepted / ready for
  // pickup), so refetch while the list is actually on screen rather than
  // only when it regains focus. loadOrders sets no spinner of its own, so
  // this is invisible until something genuinely changes.
  useFocusedPoll(loadOrders, ORDER_POLL_MS);

  const visibleOrders =
    tab === "active"
      ? pickLiveOrders(orders)
      : orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabRow}>
        <TabButton
          label={
            "Active · " +
            orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length
          }
          selected={tab === "active"}
          onPress={() => setTab("active")}
        />
        <TabButton
          label="Past"
          selected={tab === "completed"}
          onPress={() => setTab("completed")}
        />
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={visibleOrders}
        keyExtractor={(item) => item._id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadOrders();
        }}
        ListHeaderComponent={
          error ? (
            <PrintState
              kind="offline"
              title="Orders couldn’t refresh"
              body={error}
              action="Try again"
              onAction={loadOrders}
            />
          ) : null
        }
        ListEmptyComponent={
          !error ? (
            <PrintState
              title={
                tab === "active" ? "No active orders" : "No completed orders"
              }
              body={
                tab === "active"
                  ? "Your prints will show up here."
                  : "Finished orders show up here."
              }
            />
          ) : null
        }
        renderItem={({ item, index }) => {
          // payment_status isn't a `status` value - it's a separate field
          // (see models/Order.js) - but the badge needs to show it in
          // place of the real status ("pending") while a payment hasn't
          // gone through, since that order has no otp and nothing to
          // track yet. Expired/cancelled orders are excluded - they show
          // their real status and can't be paid for any more.
          const paymentUnresolved = isAwaitingPayment(item);
          const displayStatus = paymentUnresolved
            ? item.payment_status === "failed"
              ? "payment_failed"
              : "payment_pending"
            : item.status;
          const ready =
            displayStatus === "ready_for_pickup" && Boolean(item.otp);

          const cardBody = (
            <>
              <View style={styles.cardTop}>
                <StatusBadge status={displayStatus} />
                <Text style={[styles.reference, ready && styles.readyMuted]}>
                  #{orderRef(item)}
                </Text>
              </View>
              <Text style={[styles.shopName, ready && styles.readyText]}>
                {item.shop_id?.shop_name || "Print shop"}
              </Text>
              <Text style={[styles.meta, ready && styles.readyMuted]}>
                {/* Settings vary per document now, so a list row counts
                    the files and leaves the detail to OrderTracking. */}
                {item.documents?.length ?? 0} doc
                {(item.documents?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                {(item.documents || []).reduce(
                  (sum, doc) => sum + (doc.page_count || 0),
                  0,
                )}{" "}
                pages · ₹{item.total_amount ?? 0}
              </Text>

              {!paymentUnresolved && tab === "active" ? (
                <OrderJourney
                  status={item.status}
                  compact
                  illustrated={index === 0}
                />
              ) : null}
            </>
          );

          // Unresolved payments get an explicit button rather than a
          // whole-card tap target, so re-entering checkout is an
          // unambiguous, deliberate action - and it avoids nesting a
          // Pressable-as-button inside a Pressable-as-card.
          if (paymentUnresolved) {
            return (
              <View style={[styles.card, styles.paymentCard]}>
                {cardBody}
                {item.payment_status === "failed" ? (
                  <Text style={styles.paymentNote}>
                    Payment didn't go through. You weren't charged.
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.payButton,
                    pressed && styles.payButtonPressed,
                  ]}
                  onPress={() => navigateToOrder(navigation, item)}
                >
                  <Text style={styles.payButtonLabel}>Complete payment</Text>
                </Pressable>
              </View>
            );
          }

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                (ready ? "View pickup code at " : "View order at ") +
                (item.shop_id?.shop_name || "print shop")
              }
              style={({ pressed }) => [
                styles.card,
                ready && styles.readyCard,
                pressed && (ready ? { opacity: 0.85 } : styles.cardPressed),
              ]}
              onPress={() => navigateToOrder(navigation, item)}
            >
              {cardBody}
              {ready ? (
                <View style={styles.pickupPanel}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupLabel}>
                      {new Date(item.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={styles.viewCode}>
                    <Text style={styles.viewCodeText}>Pickup code</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color={colors.onPrimary}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.detailAction}>
                  <Text style={styles.tapHint}>
                    {item.status === "completed" || item.status === "expired"
                      ? "View details"
                      : "Track order"}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={colors.primary}
                  />
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function TabButton({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      style={[styles.tabButton, selected && styles.tabButtonSelected]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabButtonLabel,
          selected && styles.tabButtonLabelSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: 20,
    paddingHorizontal: 4,
    paddingTop: 4,
    borderRadius: 18,
    backgroundColor: colors.backgroundSoft,
    paddingBottom: spacing.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  tabButtonSelected: {
    backgroundColor: colors.surface,
  },
  tabButtonLabel: { ...typography.labelSmall, color: colors.textSecondary },
  tabButtonLabelSelected: { color: colors.primaryDeep },
  list: { flex: 1 },
  listContent: { padding: 20 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  cardPressed: {
    backgroundColor: colors.primaryWash,
    borderColor: colors.primary,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  shopName: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
    flexShrink: 1,
    marginTop: spacing.sm,
  },
  reference: { ...typography.caption, fontSize: 11, color: colors.textMuted },
  // Yellow means "your code is ready" everywhere it appears.
  readyCard: {
    backgroundColor: colors.yellow,
    borderColor: colors.yellow,
  },
  readyText: { color: colors.ink },
  readyMuted: { color: colors.ink },
  paymentCard: {
    backgroundColor: colors.pinkWash,
    borderColor: colors.pinkWash,
  },
  orderCharacter: {
    position: "absolute",
    right: 12,
    top: 47,
    width: 70,
    height: 88,
  },
  pickupPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "transparent",
    borderRadius: 20,
    padding: 0,
    marginTop: spacing.sm,
  },
  pickupLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.ink,
  },
  pickupCode: {
    ...typography.h2,
    fontSize: 25,
    letterSpacing: 2,
    color: colors.onPrimary,
    fontVariant: ["tabular-nums"],
  },
  viewCode: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "center",
 backgroundColor: colors.primaryDeep,
 padding: 10,
 borderRadius: 14,
  },
  viewCodeText: { ...typography.labelSmall, color: colors.onPrimary },
  detailAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  tapHint: {
    ...typography.labelSmall,
    color: colors.primaryBright,
    marginTop: spacing.sm,
  },
  paymentNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  payButton: {
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radius.button,
 backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  payButtonPressed: { opacity: 0.8 },
  payButtonLabel: { ...typography.button, color: colors.surface },
  empty: {
    textAlign: "center",
    color: colors.textSecondary,
    ...typography.body,
    marginTop: 40,
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
