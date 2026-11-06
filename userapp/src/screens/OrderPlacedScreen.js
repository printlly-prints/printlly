import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import Card from "../components/Card";
import ScreenBackground from "../components/ScreenBackground";
import { formatRupees } from "../components/PriceBreakdown";
import { orderRef } from "../utils/orderRef";
import { colors, typography, spacing, fonts } from "../theme";

// The confirmation screen, reached only by the reset in PaymentScreen
// once a payment has actually been verified server-side. It is never
// shown optimistically: the order object it renders is the one the
// verify endpoint returned, complete with the OTP it generated.
export default function OrderPlacedScreen({ route, navigation }) {
  const { order } = route.params;

  const scale = useRef(new Animated.Value(0.7)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    let cancelled = false;
    // One settle on the tick, one fade for everything under it. Nothing
    // loops, nothing bounces twice - the brief asked for celebratory,
    // not busy. Skipped outright under reduce-motion.
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        scale.setValue(1);
        fade.setValue(1);
        lift.setValue(0);
        return;
      }
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
        Animated.parallel([
          Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(lift, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [scale, fade, lift]);

  return (
    <ScreenBackground tone="deep">
      <View style={styles.content}>
        <Animated.View style={[styles.tick, { transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={52} color={colors.surface} />
        </Animated.View>

        <Animated.View style={{ opacity: fade, transform: [{ translateY: lift }] }}>
          <Text style={styles.title}>Order placed successfully!</Text>
          <Text style={styles.subtitle}>Thank you for choosing Paprout.</Text>

          <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>Order ID</Text>
                <Text style={styles.summaryValue}>{orderRef(order)}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryLabel}>Total paid</Text>
                <Text style={styles.summaryAmount}>{formatRupees(order.total_amount)}</Text>
              </View>
            </View>
          </Card>

          {/* The reference says "We've sent the order details to your
              email and SMS." This product sends neither - there is no
              mailer and no SMS gateway anywhere in the backend; what it
              does create is an in-app notification (see
              utils/notifications.js). Saying otherwise would have
              customers waiting on a message that is never coming. */}
          <Text style={styles.note}>
            You'll get an in-app notification when the shop accepts your order and again when it's
            ready to collect.
          </Text>

          <View style={styles.actions}>
            <Button
              title="View order details"
              onPress={() => navigation.navigate("OrderTracking", { order })}
            />
            <Button
              title="Continue shopping"
              variant="secondary"
              onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
            />
          </View>
        </Animated.View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", padding: spacing.lg },
  tick: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: { ...typography.h1, color: colors.textPrimary, textAlign: "center" },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  summary: { marginTop: spacing.xl },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryRight: { alignItems: "flex-end" },
  summaryLabel: { ...typography.caption, color: colors.textMuted },
  summaryValue: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.textPrimary, marginTop: 2 },
  summaryAmount: { fontFamily: fonts.headingExtraBold, fontSize: 20, color: colors.primaryDeep, marginTop: 2 },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
