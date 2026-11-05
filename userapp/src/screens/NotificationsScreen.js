import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from "react-native";
import * as DeviceNotifications from "expo-notifications";
import { useEventSounds } from "../context/EventSoundsContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import api from "../api/client";
import { useNotifications } from "../context/NotificationsContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { navigateToOrder } from "../utils/orderNavigation";
import { formatRelativeTime } from "../utils/time";
import { typography, radius } from "../theme";

export default function NotificationsScreen({ navigation }) {
  const { notifications, loading, refresh, markRead, markAllRead } = useNotifications();
  const { supported: alertsSupported, requestPermission, error: permissionError, refreshPermission } = useEventSounds();
  const [devicePermission, setDevicePermission] = useState(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [refreshing, setRefreshing] = useState(false), [openingId, setOpeningId] = useState(null), [error, setError] = useState("");
  const opening = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    refresh();
    let active = true;
    if (alertsSupported) DeviceNotifications.getPermissionsAsync().then(value => { if (active) setDevicePermission(value); }).catch(() => {});
    refreshPermission();
    return () => { active = false; };
  }, [refresh, alertsSupported, refreshPermission]));
  const allowDeviceAlerts = async () => {
    if (requestingPermission) return;
    setRequestingPermission(true);
    try {
      if (devicePermission?.canAskAgain === false) await Linking.openSettings();
      else {
        await requestPermission();
        const value = await DeviceNotifications.getPermissionsAsync();
        if (mounted.current) setDevicePermission(value);
      }
    } catch { if (mounted.current) setError('Could not open device notification permissions.'); }
    finally { if (mounted.current) setRequestingPermission(false); }
  };
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };
  const handlePress = async (notification) => {
    if (opening.current) return;
    opening.current = true; setOpeningId(notification._id); setError("");
    try {
      await markRead(notification._id);
      if (!notification.order_id) return;
      const { data } = await api.get("/orders/customer");
      if (!mounted.current) return;
      const orderId = notification.order_id?._id || notification.order_id;
      const order = data.find((candidate) => String(candidate._id) === String(orderId));
      if (order) navigateToOrder(navigation, order);
      else setError("This order is unavailable. Contact support if you need help with this update.");
    } catch {
      if (mounted.current) setError("Could not open this order. Check your connection and try again.");
    } finally { opening.current = false; if (mounted.current) setOpeningId(null); }
  };
  const needsDevicePermission = alertsSupported && devicePermission && !devicePermission.granted;
  const hasUnread = notifications.some((notification) => !notification.read);
  return <ScreenFrame title="Notifications" onBack={() => navigation.goBack()} scroll={false} contentStyle={styles.frameContent}>
    <FlatList style={styles.list} contentContainerStyle={styles.listContent} data={notifications} keyExtractor={(item) => String(item._id)} refreshing={refreshing} onRefresh={handleRefresh}
      ListHeaderComponent={hasUnread || error || permissionError || needsDevicePermission ? <View style={styles.header}>
        {needsDevicePermission ? <View style={styles.card}>
          <Text style={styles.title}>Allow device alerts</Text>
          <Text style={styles.body}>Order updates stay in this inbox. Android notification permission is needed for event sounds and device alerts.</Text>
          <Button title={devicePermission.canAskAgain === false ? 'Open Android settings' : 'Allow device alerts'} variant="secondary" onPress={allowDeviceAlerts} disabled={requestingPermission} />
        </View> : null}
        {permissionError ? <Text style={styles.error} accessibilityLiveRegion="polite">{permissionError}</Text> : null}
        {hasUnread ? <Button title="Mark all as read" variant="text" onPress={markAllRead} /> : null}
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      </View> : null}
      ListEmptyComponent={loading ? <View style={styles.empty}><ActivityIndicator color={colors.action} /><Text style={styles.note}>Loading updates…</Text></View> :
        <View style={styles.empty}><Ionicons name="notifications-outline" size={32} color={colors.action} /><Text style={styles.emptyTitle}>You’re all caught up.</Text><Text style={styles.note}>Your order and payment updates appear here.</Text><Button title="Refresh updates" variant="secondary" onPress={handleRefresh} /></View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}. ${item.body}`} accessibilityState={{ disabled: Boolean(openingId), busy: openingId === item._id }}
        style={({ pressed }) => [styles.card, !item.read && styles.unread, pressed && { backgroundColor: colors.selection }]} onPress={() => handlePress(item)} disabled={Boolean(openingId)}>
        <View style={styles.row}>
          {!item.read ? <View style={styles.unreadDot} /> : null}
          <View style={styles.copy}><Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.body}</Text><Text style={styles.time}>{formatRelativeTime(item.created_at)}</Text></View>
          {openingId === item._id ? <ActivityIndicator color={colors.action} size="small" /> : item.order_id ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null}
        </View>
      </Pressable>} />
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  frameContent: { padding: 0 }, list: { flex: 1 }, listContent: { padding: 24, flexGrow: 1, gap: 20 },
  header: { gap: 8 }, card: { minHeight: 72, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16 }, unread: { backgroundColor: colors.selection },
  row: { flexDirection: "row", alignItems: "center", gap: 10 }, copy: { flex: 1 }, title: { ...typography.bodyMedium, color: colors.textPrimary }, body: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  time: { ...typography.caption, color: colors.textMuted, marginTop: 8 }, unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.action },
  error: { ...typography.bodySmall, color: colors.error }, empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 16 }, emptyTitle: { ...typography.h3, color: colors.textPrimary, textAlign: "center" }, note: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center" },
});
