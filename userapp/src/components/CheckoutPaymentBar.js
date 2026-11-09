import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "./Button";
import { formatRupees } from "./PriceBreakdown";
import { upiOption } from "../utils/upiPayments";
import { colors, typography, spacing, radius } from "../theme";

export default function CheckoutPaymentBar({
  amount,
  upiApp,
  onSelect,
  onContinue,
  loading,
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose UPI app. Selected: ${upiOption(upiApp).title}`}
        accessibilityHint="Opens UPI options"
        accessibilityState={{ disabled: Boolean(loading) }}
        disabled={loading}
        onPress={onSelect}
        style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
      >
        <Ionicons name="wallet-outline" size={19} color={colors.primary} />
        <Text style={styles.label}>UPI</Text>
        <Ionicons name="chevron-down" size={14} color={colors.primary} />
      </Pressable>
      <Button
        title={`Continue  ${formatRupees(amount)}`}
        onPress={onContinue}
        loading={loading}
        style={styles.continue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selector: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryWash,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  label: { ...typography.label, color: colors.primaryDeep },
  pressed: { opacity: 0.7 },
  continue: { flex: 1, minWidth: 0 },
});
