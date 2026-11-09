import { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import CheckoutPaymentBar from "../components/CheckoutPaymentBar";
import Card, { CardHeader } from "../components/Card";
import PriceBreakdown from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import { upiOption } from "../utils/upiPayments";
import { finishPrintFlow } from "../utils/confirmationNavigation";
import api from "../api/client";
import { DEMO_MODE } from "../config/runtime";
import { useAuth } from "../context/AuthContext";
import { toOrderDocuments } from "../utils/documentSettings";
import { shopAvailability } from "../utils/shopAvailability";
import {
  colors,
  typography,
  fonts,
  spacing,
  radius,
  availabilityColors,
} from "../theme";

export default function CheckoutScreen({ route, navigation }) {
  const {
    uploadedDocs,
    docSettings,
    notes,
    shop,
    shopDetail,
    priceBreakdown,
    totalAmount,
    documentServices,
  } = route.params;
  const { user } = useAuth();

  // shopDetail is the freshly-fetched shop where one was loaded, so it
  // carries the more current status of the two.
  const busy = shopAvailability(shopDetail || shop);

  const upiApp = upiOption(route.params.upiApp || "google_pay").key;
  const pendingOrder = useRef(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  // Creates the real Order (priced server-side from scratch) and only
  // then hands off to payment. PaymentScreen never creates an order
  // itself - server-side signature verification needs an order_id to
  // check against from the start.
  const payNow = async () => {
    if (placing) return;
    setPlacing(true);
    setError("");
    try {
      const payload = {
        shop_id: shop._id,
        documents: toOrderDocuments(
          uploadedDocs,
          docSettings,
          documentServices,
        ),
        instructions: notes,
      };
      const draftKey = JSON.stringify([payload, totalAmount]);
      const data =
        pendingOrder.current?.key === draftKey
          ? pendingOrder.current.order
          : (await api.post("/orders", payload)).data;
      pendingOrder.current = { key: draftKey, order: data };

      if (DEMO_MODE) {
        const { data: confirmation } = await api.post("/demo/pay", {
          order_id: data._id,
        });
        finishPrintFlow(navigation, confirmation.order);
        return;
      }

      navigation.navigate("Payment", {
        orderId: data._id,
        estimatedAmount: data.total_amount,
        preferredUpiApp: upiApp,
        shopName: (shopDetail || shop).shop_name,
        documentCount: uploadedDocs.length,
        breakdown: {
          subtotal: data.base_subtotal ?? priceBreakdown.base_subtotal,
          paperSize: data.paper_size_charge ?? priceBreakdown.paper_size_charge,
          sides: data.sides_charge ?? priceBreakdown.sides_charge,
          services: data.services_charge ?? priceBreakdown.services_charge,
          platformFee: data.platform_fee ?? priceBreakdown.platform_fee,
          total: data.total_amount,
        },
      });
    } catch (err) {
      const message = err.response?.data?.message || "";
      // The shop closed between selection and submit - checked fresh at
      // creation time on the backend, never trusted from an earlier
      // snapshot. Worth handling separately: the customer needs a new
      // shop, not a retry.
      if (/closed/i.test(message)) {
        Alert.alert("Shop is closed", message, [
          {
            text: "Choose another shop",
            onPress: () => navigation.navigate("SelectShop", route.params),
          },
        ]);
      } else {
        setError(message || "Could not place the order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  };

  const rows = [
    { label: "Subtotal", value: priceBreakdown.base_subtotal },
    priceBreakdown.paper_size_charge > 0
      ? { label: "Paper size", value: priceBreakdown.paper_size_charge }
      : null,
    priceBreakdown.sides_charge > 0
      ? { label: "Double-sided", value: priceBreakdown.sides_charge }
      : null,
    priceBreakdown.services_charge > 0
      ? { label: "Additional services", value: priceBreakdown.services_charge }
      : null,
    { label: "Platform fee", value: priceBreakdown.platform_fee },
    { label: "Pickup", free: true },
  ];

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* --- shop -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Pickup from shop</Text>
          <ShopCard
            shop={shopDetail || shop}
            actionLabel="Change"
            onAction={() => navigation.navigate("SelectShop", route.params)}
          />

          {/* Informational only. A busy shop is accepting orders exactly
              as an open one does, so this does not gate the Pay button,
              does not disable anything, and does not ask the customer to
              confirm - it just makes sure nobody is surprised by the
              wait. Told here because this is the last screen before
              paying. */}
          {busy.isBusy ? (
            <View style={styles.busyBanner}>
              <View style={styles.busyDot} />
              <View style={styles.busyBody}>
                <Text style={styles.busyTitle}>
                  This shop is currently busy
                </Text>
                <Text style={styles.busyLine}>
                  Estimated preparation: ~{busy.prepMinutes} min
                </Text>
                <Text style={styles.busyLine}>
                  You can still place your order.
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* --- contact ----------------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader title="Pickup contact" />
          <ContactRow icon="person-outline" value={user?.name} />
          <ContactRow icon="call-outline" value={user?.phone} />
          <ContactRow icon="mail-outline" value={user?.email} />
        </Card>

        {/* --- the bill ---------------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader title="Price details" />
          <PriceBreakdown rows={rows} total={totalAmount} />
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky, so the amount being agreed to and the button that agrees
          to it are never scrolled apart. */}
      <CheckoutPaymentBar
        amount={totalAmount}
        upiApp={upiApp}
        onSelect={() =>
          navigation.navigate("UpiSelection", {
            selected: upiApp,
            returnTo: "Checkout",
          })
        }
        onContinue={payNow}
        loading={placing}
      />
    </ScreenBackground>
  );
}

function ContactRow({ icon, value }) {
  if (!value) return null;
  return (
    <View style={styles.contactRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <Text style={styles.contactValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.md },
  // Soft amber, no border, no warning icon: this is information, not a
  // problem, and it must not read as a blocked checkout.
  busyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: availabilityColors.busy.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  busyDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: availabilityColors.busy.dot,
    marginTop: 5,
  },
  busyBody: { flex: 1, minWidth: 0 },
  busyTitle: {
    ...typography.labelSmall,
    fontFamily: fonts.headingBold,
    color: availabilityColors.busy.text,
  },
  busyLine: {
    ...typography.caption,
    color: availabilityColors.busy.text,
    marginTop: 1,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  contactValue: { ...typography.bodySmall, color: colors.textPrimary },

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.danger },
});
