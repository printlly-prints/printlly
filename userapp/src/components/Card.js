import { PressableScale } from "pressto";
import { useReducedMotion } from "react-native-reanimated";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typography, spacing, radius, shadows } from "../theme";

// The one white surface every redesigned screen is built from. Defined
// once here so card chrome - radius, border, shadow, press feedback -
// cannot drift between screens, which is what the brief's "do not
// duplicate styling manually" is really guarding against.
//
// Pressable only when an onPress is given; otherwise a plain View, so a
// static card is not announced to a screen reader as something tappable.
export default function Card({
  children,
  style,
  onPress,
  selected,
  disabled,
  ...rest
}) {
  const reduced = useReducedMotion();
  const content = <>{children}</>;

  if (!onPress) {
    return (
      <View style={[styles.card, selected && styles.selected, style]} {...rest}>
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      config={{ minScale: reduced ? 1 : 0.99 }}
      animationConfig={{ duration: reduced ? 1 : 120 }}
      style={[
        styles.card,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {content}
    </PressableScale>
  );
}

// A card's own heading row, with an optional action on the right
// ("Change" on the shop and contact cards).
export function CardHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  disabled: { opacity: 0.55 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: { ...typography.label, color: colors.textPrimary },
  action: { ...typography.labelSmall, color: colors.primaryBright },
});
