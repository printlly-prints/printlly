import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import api from "../api/client";
import { useNotifications } from "../context/NotificationsContext";
import { navigateToOrder } from "../utils/orderNavigation";
import { formatRelativeTime } from "../utils/time";
import { colors, typography, spacing, radius } from "../theme";

// Reached from the Profile menu. Pull-based only - no push notifications
// yet, so this list is only ever as fresh as the last refresh/foreground
// event (see NotificationsContext).
//
// Notifications only carry an order_id, and there's no single-order GET
// endpoint (same constraint OrderTrackingScreen already works around), so
// tapping one fetches the customer's order list and finds the match there.
export default function NotificationsScreen({ navigation }) {
  const { notifications, loading, refresh, markRead, markAllRead } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handlePress = async (notification) => {
    markRead(notification._id);
    setOpeningId(notification._id);
    try {
      const { data } = await api.get("/orders/customer");
      const order = data.find((o) => o._id === notification.order_id);
      // If the order can't be found, the notification is still marked
      // read above - there's just nowhere left to navigate to.
      if (order) navigateToOrder(navigation, order);
    } finally {
      setOpeningId(null);
    }
  };

  const hasUnread = notifications.some((n) => !n.read);

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={notifications}
      keyExtractor={(item) => item._id}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      ListHeaderComponent={
        hasUnread ? (
          <Pressable onPress={markAllRead} style={styles.markAllRow} hitSlop={8}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.card, !item.read && styles.cardUnread]}
          onPress={() => handlePress(item)}
          disabled={openingId === item._id}
        >
          <View style={styles.cardHeader}>
            {!item.read && <View style={styles.unreadDot} />}
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, flexGrow: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  markAllRow: { alignSelf: "flex-end", paddingVertical: spacing.sm, marginBottom: spacing.sm },
  markAllText: { ...typography.labelSmall, color: colors.primaryBright },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardUnread: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // primaryAccent rather than primary: an 8px dot in primary measures ~2.1:1
  // on a dark card, and this is the one mark that says "unread". See
  // theme/colors.js - primaryAccent exists for small accents on dark.
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primaryAccent },
  title: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  time: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  empty: { textAlign: "center", ...typography.body, color: colors.textSecondary, marginTop: 40 },
});
