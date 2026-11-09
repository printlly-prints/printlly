import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { UPI_OPTIONS } from "../utils/upiPayments";
import { colors, typography, spacing, radius } from "../theme";

const logos = {
  google_pay: require("../../assets/payments/googlepay.png"),
  phonepe: require("../../assets/payments/phonepe.png"),
  paytm: require("../../assets/payments/paytm.png"),
  bhim: require("../../assets/payments/bhim.png"),
};

export function UpiAppLogo({ app }) {
  return (
    <View style={styles.logo} accessible={false}>
      {logos[app] ? (
        <Image
          source={logos[app]}
          style={styles.logoImage}
          resizeMode="contain"
        />
      ) : (
        <Ionicons
          name={app === "qr" ? "qr-code-outline" : "apps-outline"}
          size={22}
          color={colors.primary}
        />
      )}
    </View>
  );
}

export default function UpiOptions({
  value,
  onChange,
  disabled = false,
  showHeading = true,
}) {
  return (
    <View>
      {showHeading ? (
        <View style={styles.heading}>
          <View style={styles.wallet}>
            <Ionicons name="wallet-outline" size={23} color={colors.primary} />
          </View>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>
              UPI
            </Text>
            <Text style={styles.description}>
              Pay directly from your bank account
            </Text>
          </View>
        </View>
      ) : null}
      <Text style={styles.label}>Choose your UPI app</Text>
      <View
        style={styles.apps}
        accessibilityRole="radiogroup"
        accessibilityLabel="UPI options"
      >
        {UPI_OPTIONS.map((option, index) => {
          const selected = value === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="radio"
              accessibilityLabel={option.title}
              accessibilityState={{ checked: selected, disabled }}
              aria-checked={selected}
              disabled={disabled}
              onPress={() => onChange(option.key)}
              style={({ pressed }) => [
                styles.option,
                index > 3 && styles.wide,
                selected && styles.selected,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <UpiAppLogo app={option.key} />
              <View style={styles.copy}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                {index > 3 ? (
                  <Text style={styles.note}>{option.note}</Text>
                ) : null}
              </View>
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={selected ? colors.primary : colors.borderStrong}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.security}>
        <Ionicons name="lock-closed-outline" size={15} color={colors.primary} />
        <Text style={[styles.note, styles.copy]}>
          Your UPI PIN is entered only in your UPI app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  wallet: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  title: { ...typography.h3, color: colors.ink },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  label: {
    ...typography.labelSmall,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  apps: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: {
    width: "48%",
    flexGrow: 1,
    minHeight: 76,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wide: { width: "100%", minHeight: 64, paddingHorizontal: spacing.md },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryWash,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: { width: 28, height: 28 },
  optionTitle: { ...typography.labelSmall, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textSecondary },
  security: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
