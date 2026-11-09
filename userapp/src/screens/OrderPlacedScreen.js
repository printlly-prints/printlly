import { useEffect } from "react";
import { DEMO_MODE } from "../config/runtime";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useReducedMotion,
  FadeIn,
  ZoomIn,
} from "react-native-reanimated";
import Button from "../components/Button";
import Card from "../components/Card";
import OrderJourney from "../components/OrderJourney";
import ScreenBackground from "../components/ScreenBackground";
import { formatRupees } from "../components/PriceBreakdown";
import { orderRef } from "../utils/orderRef";
import { successHaptic } from "../utils/haptics";
import { colors, typography, spacing, fonts } from "../theme";

// The confirmation screen, reached only by the reset in PaymentScreen
// once a payment has actually been verified server-side. It is never
// shown optimistically: the order object it renders is the one the
// verify endpoint returned, complete with the OTP it generated.
export default function OrderPlacedScreen({ route, navigation }) {
  const { order } = route.params;
  const shopName = order.shop_id?.shop_name;

  const reduced = useReducedMotion();
  useEffect(() => {
    successHaptic();
  }, []);

  return (
    <ScreenBackground tone="deep">
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          entering={reduced ? undefined : ZoomIn.duration(240)}
          style={styles.art}
        >
          <Image
            source={require("../../assets/art/paper-pal-success.png")}
            style={styles.artImage}
            resizeMode="contain"
            accessible={false}
          />
        </Animated.View>
        <Text accessibilityRole="header" style={styles.title}>
          Order placed
        </Text>
        <Text style={styles.subtitle}>
          {shopName
            ? `${shopName} has your order.`
            : "Your print order is with the shop."}
        </Text>

        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)}>
          <OrderJourney status={order.status} illustrated={false} />

          <Card>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>Order ID</Text>
                <Text style={styles.summaryValue}>{orderRef(order)}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={styles.summaryLabel}>
                  {DEMO_MODE ? "Order total" : "Total paid"}
                </Text>
                <Text style={styles.summaryAmount}>
                  {formatRupees(order.total_amount)}
                </Text>
              </View>
            </View>
          </Card>

          {/* In-app notification only: the backend has no mailer or SMS
              gateway (see utils/notifications.js), so promising either
              would leave customers waiting on a message that never comes. */}
          {!DEMO_MODE ? (
            <Text style={styles.note}>
              We'll notify you when it's accepted and when it's ready.
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Track order"
              icon="arrow-forward"
              onPress={() => navigation.navigate("OrderTracking", { order })}
            />
            <Button
              title="Done"
              variant="secondary"
              onPress={() => navigation.popToTop()}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  art: { alignSelf: "center" },
  artImage: { width: 148, height: 180 },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryRight: { alignItems: "flex-end" },
  summaryLabel: { ...typography.caption, color: colors.textMuted },
  summaryValue: {
    fontFamily: fonts.headingBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: 2,
  },
  summaryAmount: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 20,
    color: colors.primaryDeep,
    marginTop: 2,
  },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
