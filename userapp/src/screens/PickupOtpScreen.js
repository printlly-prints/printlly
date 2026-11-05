import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Share, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import ScreenFrame from "../components/ScreenFrame";
import OtpCard from "../components/OtpCard";
import api from "../api/client";
import useFocusedPoll from "../hooks/useFocusedPoll";
import { orderRef } from "../utils/orderRef";
import { pickupCodeForOrder } from "../utils/orderState";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography } from "../theme";
export default function PickupOtpScreen({ route, navigation }) {
  const [order, setOrder] = useState(route.params.order), [error, setError] = useState("");
  const { colors } = useTheme(), styles = useThemedStyles(createStyles), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/orders/customer");
      if (!mounted.current) return;
      const updated = data.find((item) => String(item._id) === String(route.params.order._id));
      if (updated) setOrder(updated);
      setError(updated ? "" : "This order could not be found. Check My Orders or contact support.");
    } catch { if (mounted.current) setError("Connection unavailable. Showing the last server-confirmed order."); }
  }, [route.params.order._id]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useFocusedPoll(["pending", "accepted", "ready_for_pickup"].includes(order.status) ? refresh : null, 20000);
  const code = pickupCodeForOrder(order), shop = order.shop_id, shopName = shop?.shop_name || "Your print shop";
  const ready = order.status === "ready_for_pickup" && Boolean(code);
  const directions = async () => {
    const coords = shop?.location?.coordinates;
    const pinned = Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite);
    const query = encodeURIComponent(pinned ? `${coords[1]},${coords[0]}` : `${shopName} ${shop?.address || ""}`);
    try { await Linking.openURL(Platform.OS === "android" ? `geo:0,0?q=${query}` : Platform.OS === "ios" ? `maps://?q=${query}` : `https://maps.google.com/?q=${query}`); }
    catch { setError("A maps app could not be opened. Use the shop address shown above."); }
  };
  const share = () => { if (code) Share.share({ message: `Printlly order ${orderRef(order)}\nPickup code: ${code}\n${shopName}${ready ? " · ready for pickup" : " · waiting for shop readiness"}` }).catch(() => {}); };
  return <ScreenFrame title="Pickup ticket" onBack={() => navigation.goBack()} footer={<Button title="Shop directions" onPress={directions} disabled={!shop} />}>
    <View style={styles.notice}><Ionicons name="time-outline" size={20} color={colors.action} /><Text style={styles.noticeText}>{ready ? "Ready for pickup" : code ? "Waiting for the shop to finish" : "Pickup code unavailable"}</Text></View>
    <Text style={styles.title}>{shopName}</Text>{shop?.address ? <Text style={styles.address}>{shop.address}</Text> : null}
    {code ? <OtpCard order={order} caption={ready ? `Show this at ${shopName}.` : "Keep this code. We'll notify you when the shop marks your order ready."} /> : <Text style={styles.address}>{order.status === "completed" ? "This order was collected." : "View your order for the latest payment and collection status."}</Text>}
    {code ? <Button title="Share code" variant="secondary" onPress={share} style={{ marginBottom: 16 }} /> : null}
    <Pressable style={styles.row} onPress={() => navigation.navigate("Chat", { orderContext: { order_id: order._id } })} accessibilityRole="button"><View style={{ flex: 1 }}><Text style={styles.label}>Need help?</Text><Text style={styles.meta}>Order {orderRef(order)}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
    <Button title="View order details" variant="text" onPress={() => navigation.replace("OrderTracking", { order })} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({ notice: { backgroundColor: colors.infoSurface, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }, noticeText: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 }, title: { ...typography.h1, color: colors.textPrimary, marginBottom: 16 }, address: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 20 }, row: { minHeight: 72, padding: 16, borderRadius: 20, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 }, label: { ...typography.label, color: colors.textPrimary }, meta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, error: { ...typography.bodySmall, color: colors.error, padding: 16, backgroundColor: colors.errorSurface, borderRadius: 16, marginTop: 16 } });
