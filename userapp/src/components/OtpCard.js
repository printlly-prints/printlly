import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { typography, fonts } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { pickupCodeForOrder } from "../utils/orderState";
export default function OtpCard({ order, caption }) {
  const otp = pickupCodeForOrder(order), { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  const { width, fontScale } = useWindowDimensions(), timer = useRef(null);
  useEffect(() => { setCopied(false); setError(""); return () => clearTimeout(timer.current); }, [otp]);
  if (!otp) return null;
  const copy = async () => {
    try { await Clipboard.setStringAsync(otp); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800); }
    catch { setError("Could not copy the code. You can select the digits instead."); }
  };
  // Keep all six digits on screen even with a narrow viewport or larger
  // system text. The accessibility label reads each digit individually.
  const fontSize = Math.min(48, (Math.min(width, 608) - 100) / (3.9 * fontScale));
  return <View style={styles.card}>
    <Text style={styles.label}>Pickup code</Text>
    <Text style={[styles.otp, { fontSize, lineHeight: fontSize * 1.35 }]} accessibilityLabel={`Pickup code: ${otp.split("").join(" ")}`} selectable>{otp}</Text>
    <Text style={styles.caption}>{caption || "Show this code at the counter to collect your order."}</Text>
    <Pressable onPress={copy} style={styles.copy} accessibilityRole="button"><Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={colors.action} /><Text style={styles.copyLabel}>{copied ? "Copied" : "Copy code"}</Text></Pressable>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}
const createStyles = ({ colors }) => ({ card: { backgroundColor: colors.selection, borderRadius: 24, padding: 20, alignItems: "center", marginBottom: 16 }, label: { ...typography.label, color: colors.textSecondary }, otp: { fontFamily: fonts.headingExtraBold, letterSpacing: 5, paddingLeft: 5, color: colors.textPrimary, marginTop: 8 }, caption: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center", marginTop: 12 }, copy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, paddingHorizontal: 16, marginTop: 12, backgroundColor: colors.surface, borderRadius: 12 }, copyLabel: { ...typography.label, color: colors.action }, error: { ...typography.caption, color: colors.error, marginTop: 12 } });
