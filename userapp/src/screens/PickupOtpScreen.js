import { Image, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Button from "../components/Button";
import OtpCard from "../components/OtpCard";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import { orderRef } from "../utils/orderRef";
import { colors, typography, spacing } from "../theme";

// Reached by tapping a ready-for-pickup order (My Orders, Home) or
// automatically from OrderTrackingScreen's poll when it detects the
// status just turned ready_for_pickup. One job: make the OTP impossible
// to miss, with just enough around it to know where to take it.
//
// The OTP itself comes from the order, generated server-side when the
// payment was verified. Nothing here can produce one.
export default function PickupOtpScreen({ route, navigation }) {
  const { order } = route.params;
  const shop = order.shop_id;
  const shopName = shop?.shop_name || "the shop";

  const shareDetails = () => {
    Share.share({
      message: `My print is ready! Pickup OTP: ${order.otp} at ${shopName}`,
    });
  };

  return (
    <ScreenBackground tone="deep">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.readyHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Ready to collect.</Text>
            <Text style={styles.subtitle}>
              Collect from {shopName} · Order {orderRef(order)}
            </Text>
          </View>
          <Image
            source={require("../../assets/art/paper-pal-success.png")}
            style={styles.readyCharacter}
            resizeMode="contain"
            accessible={false}
          />
        </View>

        <OtpCard
          otp={order.otp}
          shopName={shopName}
          reference={orderRef(order)}
        />

        {/* Where to take it, with the photo - at a counter, recognising
            the shopfront matters more than reading its name. */}
        <ShopCard shop={shop} showContact showActions style={styles.shop} />

        <View style={styles.actions}>
          <Button
            title="View order details"
            onPress={() => navigation.replace("OrderTracking", { order })}
          />
          <Button
            title="Share OTP"
            variant="secondary"
            onPress={shareDetails}
          />
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  readyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  readyCharacter: { width: 56, height: 64 },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: { ...typography.h2, color: colors.textPrimary },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  shop: { marginTop: spacing.lg },
  actions: { marginTop: spacing.lg, gap: spacing.md },
});
