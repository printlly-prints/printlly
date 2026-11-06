import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, typography, spacing, radius, fonts } from "../theme";

// Plus/minus stepper for numeric fields. Preferred over a keyboard input
// here because tapping is faster and cannot produce an invalid value.
//
// `label` is optional. With one, this renders a stacked label-above-
// control block; without, just the control, so a caller can place it in
// its own row beside a label of its own - which is what
// DocumentSettingsCard does to keep four print controls on four lines
// instead of eight.
export default function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 999,
}) {
  const change = (next) => {
    onChange(next);
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {});
  };
  const control = (
    <View style={styles.row}>
      <Pressable
        onPress={() => change(Math.max(min, value - 1))}
        disabled={value <= min}
        style={[styles.stepButton, value <= min && styles.disabled]}
        // The button is 40x40, but the glyph inside it is small - without
        // this the tappable area would feel smaller than it looks.
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ disabled: value <= min }}
        accessibilityLabel="Decrease"
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>

      <Text style={styles.value}>{value}</Text>

      <Pressable
        onPress={() => change(Math.min(max, value + 1))}
        disabled={value >= max}
        style={[styles.stepButton, value >= max && styles.disabled]}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ disabled: value >= max }}
        accessibilityLabel="Increase"
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );

  if (!label) return control;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {control}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.xl },
  label: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  // 40x40: the floor for a control that needs an accurate tap. The old
  // 56x56 was sized for a screen showing one set of preferences; with a
  // card per document there can be four of these on screen at once.
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.4 },
  stepText: { fontSize: 20, color: colors.primaryBright, lineHeight: 24 },
  value: {
    fontFamily: fonts.headingBold,
    fontSize: 17,
    color: colors.textPrimary,
    minWidth: 44,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
});
