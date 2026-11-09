import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { toast } from "react-native-sonner";
import { colors, typography, spacing, fonts } from "../theme";

export default function OtpCard({ otp, caption, shopName, reference }) {
  const reduced = useReducedMotion(),
    timer = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(String(otp));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the code. Please try again.");
    }
  };
  if (!otp) return null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={styles.label}>PICKUP PASS</Text>
        {reference ? <Text style={styles.label}>#{reference}</Text> : null}
      </View>
      <Text
        selectable
        accessibilityLabel={`Pickup code: ${String(otp).split("").join(" ")}`}
        style={styles.code}
      >
        {String(otp)}
      </Text>
      <Text style={styles.caption}>
        {caption || "Show this code at the counter"}
      </Text>
      <View style={styles.divider}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={styles.label}>
            {shopName ? "COLLECT FROM" : "KEEP YOUR CODE HANDY"}
          </Text>
          {shopName ? <Text style={styles.shop}>{shopName}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? "Code copied" : "Copy pickup code"}
          onPress={copy}
          style={styles.copy}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={21}
            color={colors.onPrimary}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.yellow,
    borderRadius: 28,
    padding: 20,
    overflow: "hidden",
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  label: { ...typography.labelSmall, fontSize: 10, color: colors.ink },
  code: {
    fontFamily: fonts.headingBold,
    fontSize: 48,
    lineHeight: 64,
    letterSpacing: 6,
    paddingLeft: 6,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.lg,
    fontVariant: ["tabular-nums"],
  },
  caption: {
    ...typography.caption,
    color: colors.ink,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  divider: {
    position: "relative",
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(26,26,26,.3)",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  notch: {
    position: "absolute",
    top: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  notchLeft: { left: -32 },
  notchRight: { right: -32 },
  shop: { ...typography.labelSmall, color: colors.ink },
  copy: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryDeep,
    alignItems: "center",
    justifyContent: "center",
  },
});
