import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { orderJourney } from "../utils/orderJourney";
import { isAwaitingPayment } from "../utils/orderNavigation";
import { colors, typography, spacing, fonts } from "../theme";

// The customer's most urgent order, at the top of Print. Every value comes
// from GET /orders/customer.
export default function LiveOrderTicket({ order, onOpen }) {
  const reduced = useReducedMotion();
  const ready = order.status === "ready_for_pickup";
  const unpaid = !ready && isAwaitingPayment(order);
  const shopName = order.shop_id?.shop_name;
  const title = ready
    ? "Ready to collect"
    : unpaid
      ? "Finish your payment"
      : orderJourney(order.status).title;
  const code = ready && order.otp ? String(order.otp) : null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180)}
      style={styles.root}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          title,
          shopName && `at ${shopName}`,
          code && `Pickup code ${code.split("").join(" ")}`,
        ]
          .filter(Boolean)
          .join(". ")}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.ticket,
          ready && styles.ready,
          unpaid && styles.unpaid,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {shopName ? (
            <Text style={styles.shop} numberOfLines={1}>
              {shopName}
            </Text>
          ) : null}
          {code ? <Text style={styles.code}>{code}</Text> : null}
        </View>
        {ready ? (
          <Image
            source={require("../../assets/art/paper-pal-success.png")}
            style={styles.art}
            resizeMode="contain"
            accessible={false}
          />
        ) : null}
        <Ionicons name="chevron-forward" size={20} color={colors.ink} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  ticket: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.backgroundSoft,
  },
  ready: { backgroundColor: colors.yellow },
  unpaid: { backgroundColor: colors.pinkWash },
  pressed: { opacity: 0.8 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    ...typography.label,
    fontFamily: fonts.headingBold,
    color: colors.ink,
  },
  shop: { ...typography.bodySmall, color: colors.ink },
  code: {
    fontFamily: fonts.headingBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: 3,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    marginTop: spacing.xs,
  },
  art: { width: 64, height: 80 },
});
