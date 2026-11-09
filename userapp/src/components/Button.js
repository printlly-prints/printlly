import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "pressto";
import { useReducedMotion } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, radius } from "../theme";

// Pressto's packaged press interaction; layout and appearance follow the Paprout theme.
export default function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  iconPosition = "right",
  style,
}) {
  const blocked = Boolean(disabled || loading),
    secondary = variant === "secondary";
  const reduced = useReducedMotion();
  const tint = secondary ? colors.primary : colors.onPrimary;
  return (
    <PressableScale
      onPress={onPress}
      disabled={blocked}
      aria-disabled={blocked}
      aria-busy={Boolean(loading)}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: blocked, busy: Boolean(loading) }}
      config={{ minScale: reduced ? 1 : 0.97 }}
      animationConfig={{ duration: reduced ? 1 : 120 }}
      style={[
        styles.button,
        secondary && styles.secondary,
        blocked && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === "left" ? (
            <Ionicons name={icon} size={19} color={tint} />
          ) : null}
          <Text style={[styles.label, secondary && styles.secondaryLabel]}>
            {title}
          </Text>
          {icon && iconPosition === "right" ? (
            <Ionicons name={icon} size={19} color={tint} />
          ) : null}
        </View>
      )}
    </PressableScale>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
 alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.5 },
  label: {
    ...typography.button,
    color: colors.onPrimary,
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryLabel: { color: colors.primary },
});
