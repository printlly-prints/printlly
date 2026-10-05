import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, radius, fonts, shadows } from "../theme";

// The pickup OTP, as the loudest thing on whatever screen shows it.
//
// The code itself always comes from the order (generated server-side when
// payment is verified - see paymentController.js). Nothing here invents
// or formats one; an order with no OTP yet simply isn't given this card.
export default function OtpCard({ otp, caption }) {
  const [copied, setCopied] = useState(false);
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    // A short settle on appearance. Skipped entirely when the OS reports
    // reduce-motion, rather than merely shortened.
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [scale, opacity]);

  const copy = async () => {
    await Clipboard.setStringAsync(String(otp));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!otp) return null;

  return (
    <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
      <Text style={styles.label}>Pickup OTP</Text>

      {/* Spaced out so it can be read aloud at a counter without
          losing your place. The accessibility label keeps the digits
          separate for a screen reader too, rather than "four thousand
          eight hundred and twenty-seven". */}
      <Text
        style={styles.otp}
        accessibilityLabel={`Pickup OTP: ${String(otp).split("").join(" ")}`}
        selectable
      >
        {String(otp)}
      </Text>

      <Text style={styles.caption}>
        {caption || "Show this OTP to the shop owner to collect your order."}
      </Text>

      <Pressable
        onPress={copy}
        style={({ pressed }) => [styles.copy, pressed && styles.copyPressed]}
        accessibilityRole="button"
      >
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={16}
          color={copied ? colors.success : colors.primaryBright}
        />
        <Text style={[styles.copyLabel, copied && styles.copyLabelDone]}>
          {copied ? "Copied" : "Copy OTP"}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    ...shadows.card,
  },
  label: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  otp: {
    fontFamily: fonts.headingExtraBold,
    // Deliberately the largest type anywhere in the app: at a counter,
    // in bad light, at arm's length, this is the only thing that matters.
    fontSize: 52,
    lineHeight: 60,
    letterSpacing: 8,
    color: colors.primaryDeep,
    marginTop: spacing.sm,
    // Compensates for the trailing letter-space so the digits still look
    // centred rather than pushed left.
    paddingLeft: 8,
  },
  caption: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  copy: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  copyPressed: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  copyLabel: { ...typography.labelSmall, color: colors.primaryBright },
  copyLabelDone: { color: colors.success },
});
