import { Pressable, StyleSheet, Text, View } from "react-native";
import { typography, spacing, radius } from "../theme";
import { useThemedStyles } from "../context/ThemeContext";

// The one white surface every redesigned screen is built from. Defined
// once here so card chrome - radius, border, shadow, press feedback -
// cannot drift between screens, which is what the brief's "do not
// duplicate styling manually" is really guarding against.
//
// Pressable only when an onPress is given; otherwise a plain View, so a
// static card is not announced to a screen reader as something tappable.
export default function Card({ children, style, onPress, selected, disabled, ...rest }) {
  const styles = useThemedStyles(createStyles);
  const content = (
    <>
      {children}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, selected && styles.selected, style]} {...rest}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        // scale rather than translate: on a card that already carries a
        // shadow, a lift reads as the shadow breaking away from it.
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {content}
    </Pressable>
  );
}

// A card's own heading row, with an optional action on the right
// ("Change" on the shop and contact cards).
export function CardHeader({ title, actionLabel, onAction }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} style={{ minHeight: 48, justifyContent: "center" }} accessibilityRole="button">
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = ({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
  },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  pressed: { transform: [{ scale: 0.99 }] },
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
