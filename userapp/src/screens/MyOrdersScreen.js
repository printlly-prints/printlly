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
import Button from "../components/Button";
import StatusBadge from "../components/StatusBadge";
import api from "../api/client";
import { isAwaitingPayment, navigateToOrder } from "../utils/orderNavigation";
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

  const visibleOrders = orders.filter((o) =>
    tab === "active"
      ? ACTIVE_STATUSES.includes(o.status)
      : !ACTIVE_STATUSES.includes(o.status),
  );

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
          label="Active"
          selected={tab === "active"}
          onPress={() => setTab("active")}
        />
        <TabButton
          label="Completed"
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
          error ? <Text style={styles.error}>{error}</Text> : null
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyState}>
              <Image
                source={require("../../assets/art/paper-pal-cmyk.png")}
                style={styles.emptyArt}
                resizeMode="contain"
                accessible={false}
              />
              <Text style={styles.emptyTitle}>
                {tab === "active"
                  ? "A clean print queue."
                  : "Your prints will live here."}
              </Text>
              <Text style={styles.emptyCopy}>
                {tab === "active"
                  ? "Nothing waiting on you. Start a print whenever you’re ready."
                  : "Completed orders appear here after you collect them."}
              </Text>
              <Button
                title="Start a print"
                onPress={() => navigation.navigate("UploadDocuments")}
                icon="add"
              />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
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

          const cardBody = (
            <>
              <View style={styles.cardTop}>
                <Text style={styles.shopName}>
                  {item.shop_id?.shop_name || "Print shop"}
                </Text>
                <StatusBadge status={displayStatus} />
              </View>
              <Text style={styles.meta}>
                {/* Settings vary per document now, so a list row counts
                    the files and leaves the detail to OrderTracking. */}
                {item.documents?.length ?? 0} doc
                {(item.documents?.length ?? 0) === 1 ? "" : "s"} · ₹
                {item.total_amount ?? 0}
              </Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </>
          );

          // Unresolved payments get an explicit button rather than a
          // whole-card tap target, so re-entering checkout is an
          // unambiguous, deliberate action - and it avoids nesting a
          // Pressable-as-button inside a Pressable-as-card.
          if (paymentUnresolved) {
            return (
              <View style={styles.card}>
                {cardBody}
                {item.payment_status === "failed" ? (
                  <Text style={styles.paymentNote}>
                    Your last payment attempt didn't go through - no charge was
                    made.
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
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => navigateToOrder(navigation, item)}
            >
              {cardBody}
              <Text style={styles.tapHint}>
                {item.status === "ready_for_pickup"
                  ? "Tap to view OTP"
                  : item.status === "expired"
                    ? "Tap for details"
                    : "Tap to track"}
              </Text>
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
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyArt: { width: 112, height: 148, marginBottom: 24 },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
    maxWidth: 280,
  },
  screen: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonSelected: {
    backgroundColor: colors.primaryWash,
    borderColor: colors.primary,
  },
  tabButtonLabel: { ...typography.labelSmall, color: colors.textSecondary },
  tabButtonLabelSelected: { color: colors.primaryDeep },
  list: { flex: 1 },
  listContent: { padding: spacing.lg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
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
  shopName: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 },
  meta: {
    ...typography.body,
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
  payButtonPressed: { backgroundColor: colors.primaryDeep },
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
