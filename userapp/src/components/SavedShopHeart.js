import { useRef, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSavedShops } from "../context/SavedShopsContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";

export default function SavedShopHeart({ shop, size = 20, style, overlay = false }) {
  const { isSaved, toggleSaved } = useSavedShops(), { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const saved = isSaved(shop._id), inFlight = useRef(false), [busy, setBusy] = useState(false);
  const toggle = async () => { if (inFlight.current) return; inFlight.current = true; setBusy(true); try { await toggleSaved(shop); } finally { inFlight.current = false; setBusy(false); } };
  return <Pressable onPress={toggle} disabled={busy} style={[styles.button, overlay && styles.overlay, style]} accessibilityRole="button"
    accessibilityLabel={`${saved ? "Remove" : "Save"} ${shop.shop_name || "shop"}${saved ? " from saved shops" : ""}`} accessibilityState={{ selected: saved, disabled: busy, busy }}>
    {busy ? <ActivityIndicator size="small" color={colors.action} /> : <Ionicons name={saved ? "heart" : "heart-outline"} size={size} color={saved ? colors.action : colors.textSecondary} />}
  </Pressable>;
}
const createStyles = ({ colors }) => ({ button: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }, overlay: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.controlBorder } });
