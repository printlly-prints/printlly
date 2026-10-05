import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import Card, { CardHeader } from "../components/Card";
import PriceBreakdown, { formatRupees } from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { toOrderDocuments } from "../utils/documentSettings";
import { shopAvailability } from "../utils/shopAvailability";
import { colors, typography, fonts, spacing, radius, shadows, availabilityColors } from "../theme";

// Fulfilment options. Delivery is drawn but not selectable: this backend
// has no delivery of any kind - no address on an Order, no courier, no
// delivery fee in the pricing calculation - so a selectable "Home
// Delivery ₹30-₹50" would take a choice the product cannot honour and
// quote a fee nothing would ever charge. Marked as coming soon instead,
// which is what the brief asks for when the product doesn't support it.
const FULFILMENT = [
  {
    key: "pickup",
    icon: "storefront-outline",
    title: "Pickup from shop",
    note: "Free",
    available: true,
  },
  {
    key: "delivery",
    icon: "bicycle-outline",
    title: "Home delivery",
    note: "Coming soon",
    available: false,
  },
];

// Payment methods. These are a PREFERENCE, not the payment itself: the
// actual charge happens in Razorpay's own checkout, which is where card
// details and UPI PINs are entered and where the real UPI QR lives. What
// is chosen here is passed through as Razorpay's prefill.method, so the
// customer lands on the method they picked rather than the default tab.
const PAYMENT_METHODS = [
  { key: "upi", icon: "phone-portrait-outline", title: "UPI", note: "GPay, PhonePe, Paytm and others" },
  { key: "card", icon: "card-outline", title: "Card", note: "Credit or debit" },
  { key: "wallet", icon: "wallet-outline", title: "Wallet", note: "Paytm, Amazon Pay and others" },
];

export default function CheckoutScreen({ route, navigation }) {
  const { uploadedDocs, docSettings, notes, shop, shopDetail, priceBreakdown, totalAmount, documentServices } =
    route.params;
  const { user } = useAuth();

  // shopDetail is the freshly-fetched shop where one was loaded, so it
  // carries the more current status of the two.
  const busy = shopAvailability(shopDetail || shop);

  const [fulfilment, setFulfilment] = useState("pickup");
  const [method, setMethod] = useState("upi");
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
      const { data } = await api.post("/orders", {
        shop_id: shop._id,
        documents: toOrderDocuments(uploadedDocs, docSettings, documentServices),
        instructions: notes,
      });

      navigation.navigate("Payment", {
        orderId: data._id,
        estimatedAmount: data.total_amount,
        preferredMethod: method,
        breakdown: {
          subtotal: priceBreakdown.base_subtotal,
          platformFee: priceBreakdown.platform_fee,
          total: totalAmount,
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
          { text: "Choose another shop", onPress: () => navigation.navigate("SelectShop", route.params) },
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
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>Complete your order in a few easy steps.</Text>

        {/* --- fulfilment ------------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader title="Delivery option" />
          <View style={styles.optionRow}>
            {FULFILMENT.map((option) => {
              const selected = fulfilment === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => option.available && setFulfilment(option.key)}
                  disabled={!option.available}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: !option.available }}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    !option.available && styles.optionDisabled,
                    pressed && option.available && styles.optionPressed,
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={selected ? colors.primaryBright : colors.textMuted}
                  />
                  <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.optionNote, selected && styles.optionNoteSelected]}>
                    {option.note}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* --- shop -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Print shop</Text>
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
                <Text style={styles.busyTitle}>This shop is currently busy</Text>
                <Text style={styles.busyLine}>
                  Estimated preparation: ~{busy.prepMinutes} min
                </Text>
                <Text style={styles.busyLine}>You can still place your order.</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* --- contact ----------------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader
            title="Contact details"
            actionLabel="Change"
            // There is no PATCH route for a customer profile yet, so this
            // says so rather than opening an editor that cannot save.
            onAction={() =>
              Alert.alert(
                "Contact details",
                "Editing your profile isn't available yet. The shop will use the number on your account for this order."
              )
            }
          />
          <ContactRow icon="person-outline" value={user?.name} />
          <ContactRow icon="call-outline" value={user?.phone} />
          <ContactRow icon="mail-outline" value={user?.email} />
        </Card>

        {/* --- payment method ---------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader title="Payment method" />
          {PAYMENT_METHODS.map((option, i) => {
            const selected = method === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setMethod(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.methodRow,
                  i > 0 && styles.methodRowBorder,
                  pressed && styles.methodRowPressed,
                ]}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? colors.primaryBright : colors.border}
                />
                <Ionicons name={option.icon} size={18} color={colors.textSecondary} />
                <View style={styles.methodText}>
                  <Text style={styles.methodTitle}>{option.title}</Text>
                  <Text style={styles.methodNote}>{option.note}</Text>
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.methodFootnote}>
            You'll confirm and pay in Razorpay's secure window, which opens on the next screen.
          </Text>
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
      <View style={styles.footer}>
        <Button
          title={`Pay now  ${formatRupees(totalAmount)}`}
          onPress={payNow}
          loading={placing}
        />
      </View>
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
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },
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
  busyLine: { ...typography.caption, color: availabilityColors.busy.text, marginTop: 1 },
  sectionLabel: { ...typography.label, color: colors.textPrimary, marginBottom: spacing.sm },

  optionRow: { flexDirection: "row", gap: spacing.md },
  option: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: 2,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryWash },
  optionPressed: { transform: [{ scale: 0.99 }] },
  optionDisabled: { opacity: 0.5, backgroundColor: colors.backgroundSoft },
  optionTitle: { ...typography.labelSmall, color: colors.textPrimary, marginTop: spacing.xs },
  optionTitleSelected: { color: colors.primaryDeep },
  optionNote: { ...typography.caption, color: colors.textMuted },
  optionNoteSelected: { color: colors.primaryBright },

  contactRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  contactValue: { ...typography.bodySmall, color: colors.textPrimary },

  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  methodRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  methodRowPressed: { backgroundColor: colors.primaryWash },
  methodText: { flex: 1 },
  methodTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  methodNote: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  methodFootnote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },

  errorBox: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.danger },

  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.sheet,
  },
});
