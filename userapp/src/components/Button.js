import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { typography, radius } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
export default function Button({ title, onPress, loading, disabled, variant = "primary", icon, iconPosition = "right", style, accessibilityLabel }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const secondary = variant === "secondary", textOnly = variant === "text", inactive = Boolean(disabled || loading);
  const tint = secondary || textOnly ? colors.action : colors.onAction;
  return <Pressable onPress={onPress} disabled={inactive} accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, textOnly && styles.textOnly, pressed && !inactive && (secondary || textOnly ? styles.secondaryPressed : styles.pressed), disabled && styles.disabled, style]}>
    <View style={styles.row}>
      {loading ? <ActivityIndicator color={tint} size="small" /> : icon && iconPosition === "left" ? <Ionicons name={icon} size={20} color={tint} /> : null}
      <Text style={[styles.label, { color: disabled ? colors.textMuted : tint }]}>{title}</Text>
      {!loading && icon && iconPosition === "right" ? <Ionicons name={icon} size={20} color={tint} /> : null}
    </View>
  </Pressable>;
}
const createStyles = ({ colors }) => ({
  button: { minHeight: 48, borderRadius: radius.button, backgroundColor: colors.action, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: "100%" }, label: { ...typography.button, textAlign: "center", flexShrink: 1 },
  pressed: { backgroundColor: colors.actionPressed }, secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.controlBorder }, secondaryPressed: { backgroundColor: colors.selection }, textOnly: { backgroundColor: "transparent" }, disabled: { backgroundColor: colors.actionDisabled },
});
