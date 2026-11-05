import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import ScreenFrame from "../components/ScreenFrame";
import OtpCard from "../components/OtpCard";
import { orderRef } from "../utils/orderRef";
import { pickupCodeForOrder } from "../utils/orderState";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography } from "../theme";
export default function OrderPlacedScreen({ route, navigation }) {
  const { order } = route.params, { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const livePaid = order.payment_status === "paid" && ["pending", "accepted", "ready_for_pickup"].includes(order.status);
  const track = () => navigation.navigate("OrderTracking", { order });
  return <ScreenFrame title="Order placed" footer={<Button title={livePaid ? "Track order" : "View order status"} onPress={track} />}>
    <View style={styles.notice}><Ionicons name={livePaid ? "checkmark-circle-outline" : "time-outline"} size={20} color={colors.action} /><Text style={styles.noticeText}>{livePaid ? "Payment confirmed" : "Check your order status"}</Text></View>
    <Text style={styles.title}>{livePaid ? "Your print is with the shop." : "Your order needs a check."}</Text>
    <Pressable style={styles.row} onPress={track} accessibilityRole="button"><View style={{ flex: 1 }}><Text style={styles.label}>{order.shop_id?.shop_name || "Your print shop"}</Text><Text style={styles.meta}>{order.status === "pending" ? "Waiting for acceptance" : order.status === "accepted" ? "Shop accepted" : order.status === "ready_for_pickup" ? "Ready for pickup" : "View latest status"}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
    {pickupCodeForOrder(order) ? <OtpCard order={order} caption="Keep this for collection. We'll tell you when it's ready." /> : <Text style={styles.meta}>A six-digit pickup code will appear after server-confirmed payment.</Text>}
    <Pressable style={styles.row} onPress={track} accessibilityRole="button"><View style={{ flex: 1 }}><Text style={styles.label}>View receipt</Text><Text style={styles.meta}>Order {orderRef(order)}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({ notice: { backgroundColor: colors.infoSurface, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }, noticeText: { ...typography.bodySmall, color: colors.textPrimary }, title: { ...typography.h1, color: colors.textPrimary, marginBottom: 20 }, row: { minHeight: 72, padding: 16, borderRadius: 20, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 20 }, label: { ...typography.label, color: colors.textPrimary }, meta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 } });
