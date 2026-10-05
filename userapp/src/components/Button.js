import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, radius, shadows } from "../theme";

// Large primary button used for every main action. Minimum height of 56
// keeps it comfortably tappable.
//
// `icon` / `iconPosition` draw a chevron beside the label for the
// directional CTAs in the checkout flow ("Proceed to Checkout →",
// "← Continue Shopping"). It nudges on press rather than animating on a
// loop - a button that moves by itself pulls the eye away from the
// content the customer is meant to be reading.
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
  const isDisabled = disabled || loading;
  const isSecondary = variant === "secondary";
  const tint = isSecondary ? colors.primary : colors.surface;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.secondary,
        pressed && !isDisabled && (isSecondary ? styles.secondaryPressed : styles.pressed),
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {({ pressed }) =>
        loading ? (
          <ActivityIndicator color={tint} />
        ) : (
          <View style={styles.row}>
            {icon && iconPosition === "left" ? (
              <Ionicons
                name={icon}
                size={18}
                color={tint}
                style={pressed && !isDisabled ? styles.nudgeLeft : null}
              />
            ) : null}
            <Text style={[styles.label, isSecondary && styles.secondaryLabel]}>{title}</Text>
            {icon && iconPosition === "right" ? (
              <Ionicons
                name={icon}
                size={18}
                color={tint}
                style={pressed && !isDisabled ? styles.nudgeRight : null}
              />
            ) : null}
          </View>
        )
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nudgeRight: { transform: [{ translateX: 3 }] },
  nudgeLeft: { transform: [{ translateX: -3 }] },
  // Pressed state swaps to the deeper teal rather than just dimming, per
  // the shared design tokens (primaryDeep is reserved for hover/press).
  pressed: { backgroundColor: colors.primaryDeep },
  secondary: {
    // White, not transparent: these sit on the green environment now, and
    // a transparent button would let the decoration show through its face.
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryPressed: { backgroundColor: colors.primaryWash },
  disabled: { opacity: 0.5 },
  label: { ...typography.button, color: colors.surface },
  secondaryLabel: { color: colors.primaryBright },
});
