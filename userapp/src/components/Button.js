import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, radius } from "../theme";

// Shared action control: immediate press feedback with reduced-motion support.
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
  const tint = isSecondary ? colors.primary : colors.onPrimary;
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{
        disabled: Boolean(isDisabled),
        busy: Boolean(loading),
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={[
          styles.button,
          isSecondary && styles.secondary,
          pressed &&
            !isDisabled &&
            (isSecondary ? styles.secondaryPressed : styles.pressed),
          isDisabled && styles.disabled,
          {
            transitionProperty: ["transform", "backgroundColor"],
            transitionDuration: reduced ? 0 : 120,
            transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
            transform: [
              { scale: pressed && !isDisabled && !reduced ? 0.97 : 1 },
            ],
          },
          style,
        ]}
      >
        {loading ? (
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
            <Text style={[styles.label, isSecondary && styles.secondaryLabel]}>
              {title}
            </Text>
            {icon && iconPosition === "right" ? (
              <Ionicons
                name={icon}
                size={18}
                color={tint}
                style={pressed && !isDisabled ? styles.nudgeRight : null}
              />
            ) : null}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
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
  nudgeRight: { transform: [{ translateX: 3 }] },
  nudgeLeft: { transform: [{ translateX: -3 }] },
  // Pressed state swaps to the deeper teal rather than just dimming, per
  // the shared design tokens (primaryDeep is reserved for hover/press).
  pressed: { backgroundColor: colors.primaryDeep },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  secondaryPressed: { backgroundColor: colors.primaryWash },
  disabled: { opacity: 0.5 },
  label: {
    ...typography.button,
    color: colors.onPrimary,
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryLabel: { color: colors.primaryBright },
});
