import { DEMO_MODE } from "../config/runtime";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useReducedMotion, FadeIn } from "react-native-reanimated";
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

  const reduced = useReducedMotion();

  return (
    <ScreenBackground tone="deep">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.successHeader}>
          <Image
            source={require("../../assets/art/paper-pal-success.png")}
            style={styles.successArt}
            resizeMode="contain"
            accessible={false}
          />
          <View style={styles.successCopy}>
            <Text accessibilityRole="header" style={styles.title}>
              Order placed
            </Text>
            <Text style={styles.subtitle}>
              {DEMO_MODE
                ? "Your order details are all here."
                : "Your print order is with the shop."}
            </Text>
          </View>
        </View>

        <Animated.View entering={reduced ? undefined : FadeIn.duration(200)}>
          <Card style={styles.summary}>
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

          {/* The reference says "We've sent the order details to your
              email and SMS." This product sends neither - there is no
              mailer and no SMS gateway anywhere in the backend; what it
              does create is an in-app notification (see
              utils/notifications.js). Saying otherwise would have
              customers waiting on a message that is never coming. */}
          <Text style={styles.note}>
            {DEMO_MODE
              ? "Open your order to see its status and pickup code."
              : "You’ll get an in-app notification when the shop accepts your order and again when it’s ready to collect."}
          </Text>

          <View style={styles.actions}>
            <Button
              title="View order details"
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
  successHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  successArt: { width: 100, height: 130 },
  successCopy: { flex: 1 },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  summary: { marginTop: spacing.xl },
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
