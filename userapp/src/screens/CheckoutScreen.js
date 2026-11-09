import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import CheckoutPaymentBar from "../components/CheckoutPaymentBar";
import Card, { CardHeader } from "../components/Card";
import CartItem from "../components/CartItem";
import PriceBreakdown from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import ShopCard from "../components/ShopCard";
import { upiOption } from "../utils/upiPayments";
import { finishPrintFlow } from "../utils/confirmationNavigation";
import api from "../api/client";
import { DEMO_MODE } from "../config/runtime";
import { useAuth } from "../context/AuthContext";
import {
  toComparePricingDocuments,
  toOrderDocuments,
} from "../utils/documentSettings";
import { shopAvailability } from "../utils/shopAvailability";
import {
  colors,
  typography,
  fonts,
  spacing,
  radius,
  availabilityColors,
} from "../theme";

// Review and pay on one screen.
//
// Nothing here is priced in the app. Copies can be changed, and when they
// are, the whole order is re-quoted by the server (POST
// /shops/compare-pricing, scoped to this shop) rather than the app
// multiplying anything itself: shop rates are per-vendor and the platform
// fee can be a percentage, so an app-side "x copies" would drift from the
// real charge. The number the customer sees is always one the server just
// produced.
export default function CheckoutScreen({ route, navigation }) {
  const { shop, notes } = route.params;
  const { user } = useAuth();

  const [uploadedDocs, setUploadedDocs] = useState(route.params.uploadedDocs);
  const [docSettings, setDocSettings] = useState(route.params.docSettings);
  const [quote, setQuote] = useState({
    priceBreakdown: route.params.priceBreakdown,
    totalAmount: route.params.totalAmount,
    documentTotals: route.params.documentTotals,
    documentServices: route.params.documentServices,
  });
  const [repricing, setRepricing] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  // The shop's own rates and freshest status. Non-fatal if it fails: the
  // per-page line is omitted and every server-quoted price still shows.
  const [shopDetail, setShopDetail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/shops/${shop._id}`)
      .then(({ data }) => {
        if (!cancelled) setShopDetail(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shop._id]);

  const perPageRateFor = (settings) => {
    const pricing = shopDetail?.pricing;
    if (!pricing) return undefined;
    return settings.color_mode === "color"
      ? pricing.rate_per_page_color
      : pricing.rate_per_page_bw;
  };

  // Keyed on a token so a slow earlier response can never overwrite a newer
  // one when "+" is tapped quickly.
  const requestToken = useRef(0);
  const reprice = useCallback(
    async (nextDocs, nextSettings) => {
      const token = ++requestToken.current;
      setRepricing(true);
      setQuoteError("");
      try {
        const { data } = await api.post("/shops/compare-pricing", {
          documents: toComparePricingDocuments(nextDocs, nextSettings),
          shop_id: shop._id,
        });
        if (token !== requestToken.current) return;

        const result = data?.[0];
        if (!result) {
          setQuoteError(
            `${shop.shop_name} can't price this order any more. Choose another shop.`,
          );
          return;
        }
        setQuote({
          priceBreakdown: result.price_breakdown,
          totalAmount: result.total_amount,
          documentTotals: result.document_totals,
          documentServices: result.document_services,
        });
      } catch (err) {
        if (token !== requestToken.current) return;
        setQuoteError(
          err.response?.data?.message ||
            "Couldn't update the price. Check your connection.",
        );
      } finally {
        if (token === requestToken.current) setRepricing(false);
      }
    },
    [shop._id, shop.shop_name],
  );

  const setCopies = (index, copies) => {
    const nextSettings = docSettings.map((s, i) =>
      i === index ? { ...s, copies } : s,
    );
    setDocSettings(nextSettings);
    reprice(uploadedDocs, nextSettings);
  };

  const removeDoc = (index) => {
    const nextDocs = uploadedDocs.filter((_, i) => i !== index);
    const nextSettings = docSettings.filter((_, i) => i !== index);
    setUploadedDocs(nextDocs);
    setDocSettings(nextSettings);
    reprice(nextDocs, nextSettings);
  };

  // shopDetail is the freshly-fetched shop where one was loaded, so it
  // carries the more current status of the two.
  const busy = shopAvailability(shopDetail || shop);

  const upiApp = upiOption(route.params.upiApp || "google_pay").key;
  const pendingOrder = useRef(null);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const changeShop = () =>
    navigation.navigate("SelectShop", {
      ...route.params,
      uploadedDocs,
      docSettings,
    });

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
          quote.documentServices,
        ),
        instructions: notes,
      };
      const draftKey = JSON.stringify([payload, quote.totalAmount]);
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

      const { priceBreakdown } = quote;
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
          { text: "Choose another shop", onPress: changeShop },
        ]);
      } else {
        setError(message || "Could not place the order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  };

  // Set by the UPI sheet when the customer confirms there.
  const payRequest = route.params.payRequest;
  useEffect(() => {
    if (payRequest) payNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payRequest]);

  const { priceBreakdown, totalAmount } = quote;
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
  const pickupBy = [user?.name, user?.phone || user?.email]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* --- documents --------------------------------------------- */}
        <Card style={styles.itemsCard}>
          {uploadedDocs.map((doc, i) => (
            <View key={doc.upload_id}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <CartItem
                name={doc.original_name}
                pageCount={doc.page_count}
                settings={docSettings[i]}
                copies={docSettings[i].copies}
                perPageRate={perPageRateFor(docSettings[i])}
                services={quote.documentServices?.[i]}
                total={quote.documentTotals?.[i]}
                editable
                canRemove={uploadedDocs.length > 1}
                onChangeCopies={(copies) => setCopies(i, copies)}
                onRemove={() => removeDoc(i)}
              />
            </View>
          ))}
        </Card>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate("UploadDocuments", {
              preselectedShop: shopDetail || shop,
              initialUploadedDocs: uploadedDocs,
              initialDocSettings: docSettings,
            })
          }
          style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
          <Text style={styles.addMoreLabel}>Add documents</Text>
        </Pressable>

        {quoteError ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {quoteError}
            </Text>
          </View>
        ) : null}

        {/* --- shop -------------------------------------------------- */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Pickup from</Text>
          <ShopCard
            shop={shopDetail || shop}
            actionLabel="Change"
            onAction={changeShop}
          />
          {pickupBy ? (
            <Text style={styles.pickupBy}>Pickup by {pickupBy}</Text>
          ) : null}

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
                  About {busy.prepMinutes} min to prepare
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* --- the bill ---------------------------------------------- */}
        <Card style={styles.card}>
          <CardHeader title="Price details" />
          <PriceBreakdown rows={rows} total={totalAmount} />
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky, so the amount being agreed to and the button that agrees
          to it are never scrolled apart. */}
      <CheckoutPaymentBar
        amount={totalAmount}
        onContinue={() =>
          navigation.navigate("UpiSelection", {
            selected: upiApp,
            returnTo: "Checkout",
            amount: totalAmount,
          })
        }
        loading={placing || repricing}
        disabled={Boolean(quoteError)}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  itemsCard: { paddingVertical: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border },
  addMore: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  addMoreLabel: { ...typography.labelSmall, color: colors.primary },
  pressed: { opacity: 0.7 },
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
  pickupBy: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.danger },
});
