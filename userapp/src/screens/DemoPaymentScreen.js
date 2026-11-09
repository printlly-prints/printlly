import { finishPrintFlow } from "../utils/confirmationNavigation";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import CheckoutPaymentBar from "../components/CheckoutPaymentBar";
import Card, { CardHeader } from "../components/Card";
import PriceBreakdown from "../components/PriceBreakdown";
import { upiOption } from "../utils/upiPayments";
import api from "../api/client";
import { colors, typography, spacing } from "../theme";

export default function DemoPaymentScreen({ route, navigation }) {
  const {
    orderId,
    estimatedAmount,
    breakdown,
    preferredUpiApp,
    shopName,
    documentCount,
  } = route.params;
  const upiApp = upiOption(route.params.upiApp || preferredUpiApp).key;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const confirmOrder = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/demo/pay", { order_id: orderId });
      finishPrintFlow(navigation, data.order);
    } catch (err) {
      setError(
        err.message || "Could not confirm your order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const rows = breakdown
    ? [
        { label: "Subtotal", value: breakdown.subtotal },
        breakdown.paperSize > 0 && {
          label: "Paper size",
          value: breakdown.paperSize,
        },
        breakdown.sides > 0 && {
          label: "Double-sided",
          value: breakdown.sides,
        },
        breakdown.services > 0 && {
          label: "Additional services",
          value: breakdown.services,
        },
        { label: "Platform fee", value: breakdown.platformFee },
        { label: "Pickup", free: true },
      ]
    : [];
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Complete your order
        </Text>
        <Text style={styles.body}>Review the final amount, then continue.</Text>
        {shopName || documentCount ? (
          <View style={styles.orderRow}>
            <Ionicons
              name="storefront-outline"
              size={22}
              color={colors.primary}
            />
            <View style={styles.copy}>
              {shopName ? <Text style={styles.label}>{shopName}</Text> : null}
              {documentCount ? (
                <Text style={styles.caption}>
                  {documentCount}{" "}
                  {documentCount === 1 ? "document" : "documents"} · Pickup from
                  shop
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <Card>
          <CardHeader title="Amount details" />
          <PriceBreakdown
            rows={rows}
            total={estimatedAmount}
            totalLabel="Amount to pay"
          />
        </Card>
        <View style={styles.orderRow}>
          <Ionicons name="bag-check-outline" size={20} color={colors.primary} />
          <Text style={[styles.caption, styles.copy]}>
            You'll find this in Orders.
          </Text>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <CheckoutPaymentBar
        amount={estimatedAmount}
        upiApp={upiApp}
        onSelect={() =>
          navigation.navigate("UpiSelection", {
            selected: upiApp,
            returnTo: "Payment",
          })
        }
        onContinue={confirmOrder}
        loading={loading}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.h2, color: colors.ink },
  body: { ...typography.bodySmall, color: colors.textSecondary },
  copy: { flex: 1, minWidth: 0 },
  label: { ...typography.label, color: colors.ink },
  caption: { ...typography.caption, color: colors.textSecondary },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.sm,
  },
  error: { ...typography.bodySmall, color: colors.dangerText },
});
