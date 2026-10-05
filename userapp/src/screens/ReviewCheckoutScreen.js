import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import Card from "../components/Card";
import CartItem from "../components/CartItem";
import { formatRupees } from "../components/PriceBreakdown";
import ScreenBackground from "../components/ScreenBackground";
import api from "../api/client";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { colors, typography, spacing, radius } from "../theme";

// Step 4 of the order flow, redesigned as the reference's "Your Cart":
// every uploaded document as its own white card, with its own settings,
// its own workings and its own price.
//
// Nothing on this screen is priced in the app. Copies can be changed
// here, and when they are, the whole order is re-quoted by the server
// (POST /shops/compare-pricing, scoped to this shop) rather than the app
// multiplying anything itself. That matters more than it looks: shop
// rates are per-vendor and the platform fee can be a percentage, so an
// app-side "× copies" would drift from the real charge the moment either
// changed. The number the customer sees is always one the server just
// produced.
export default function ReviewCheckoutScreen({ route, navigation }) {
  const params = route.params;
  const { shop, notes } = params;

  const [uploadedDocs, setUploadedDocs] = useState(params.uploadedDocs);
  const [docSettings, setDocSettings] = useState(params.docSettings);
  const [quote, setQuote] = useState({
    priceBreakdown: params.priceBreakdown,
    totalAmount: params.totalAmount,
    documentTotals: params.documentTotals,
    documentServices: params.documentServices,
  });
  const [repricing, setRepricing] = useState(false);
  const [error, setError] = useState("");

  // The shop's own rates, for the "₹2.00 per page" line on each card.
  // Fetched rather than passed: SelectShop only forwards what it showed,
  // and a per-page rate is a property of the shop, not of the quote.
  const [shopDetail, setShopDetail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/shops/${shop._id}`)
      .then(({ data }) => {
        if (!cancelled) setShopDetail(data);
      })
      .catch(() => {
        // Non-fatal: the per-page line is omitted, every price still shows.
      });
    return () => {
      cancelled = true;
    };
  }, [shop._id]);

  const perPageRateFor = (settings) => {
    const pricing = shopDetail?.pricing;
    if (!pricing) return undefined;
    return settings.color_mode === "color" ? pricing.rate_per_page_color : pricing.rate_per_page_bw;
  };

  // Re-quote after an edit. Keyed on a token so a slow earlier response
  // can never overwrite a newer one - tapping "+" three times quickly
  // otherwise leaves whichever request happens to land last in charge.
  const requestToken = useRef(0);
  const reprice = useCallback(
    async (nextDocs, nextSettings) => {
      const token = ++requestToken.current;
      setRepricing(true);
      setError("");
      try {
        const { data } = await api.post("/shops/compare-pricing", {
          documents: toComparePricingDocuments(nextDocs, nextSettings),
          shop_id: shop._id,
        });
        if (token !== requestToken.current) return;

        const result = data?.[0];
        if (!result) {
          setError(`${shop.shop_name} can't price this order any more. Go back and pick another shop.`);
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
        setError(err.response?.data?.message || "Couldn't update the price. Check your connection.");
      } finally {
        if (token === requestToken.current) setRepricing(false);
      }
    },
    [shop._id, shop.shop_name]
  );

  const setCopies = (index, copies) => {
    const nextSettings = docSettings.map((s, i) => (i === index ? { ...s, copies } : s));
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

  const proceed = () => {
    navigation.navigate("Checkout", {
      uploadedDocs,
      docSettings,
      notes,
      shop,
      shopDetail,
      ...quote,
    });
  };

  const itemCount = uploadedDocs.length;

  return (
    <ScreenBackground>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Cart</Text>
        <Text style={styles.subtitle}>Review your items before checkout.</Text>

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
                canRemove={itemCount > 1}
                onChangeCopies={(copies) => setCopies(i, copies)}
                onRemove={() => removeDoc(i)}
              />
            </View>
          ))}
        </Card>

        {/* Lightweight on purpose - it is an escape hatch back into the
            upload flow, not a competing call to action. Settings for the
            documents already here are carried forward. */}
        <Pressable
          onPress={() =>
            navigation.navigate("UploadDocuments", { preselectedShop: shopDetail || shop })
          }
          style={({ pressed }) => [styles.addMore, pressed && styles.addMorePressed]}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primaryBright} />
          <View>
            <Text style={styles.addMoreTitle}>Add more files</Text>
            <Text style={styles.addMoreBody}>Upload and add to your cart</Text>
          </View>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Card style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Total ({itemCount} item{itemCount === 1 ? "" : "s"})
            </Text>
            {repricing ? (
              <ActivityIndicator color={colors.primaryBright} />
            ) : (
              <Text style={styles.totalValue}>{formatRupees(quote.totalAmount)}</Text>
            )}
          </View>
          <Text style={styles.totalNote}>
            Includes paper, sides, add-on services and the platform fee. Full breakdown at checkout.
          </Text>
        </Card>

        <Button
          title="Proceed to Checkout"
          icon="arrow-forward"
          onPress={proceed}
          disabled={repricing || Boolean(error) || itemCount === 0}
        />

        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.continueShopping}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={16} color={colors.primaryBright} />
          <Text style={styles.continueShoppingLabel}>Continue shopping</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },

  itemsCard: { paddingVertical: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border },

  addMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primaryWash,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  addMorePressed: { opacity: 0.75 },
  addMoreTitle: { ...typography.label, color: colors.primaryDeep },
  addMoreBody: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.danger },

  totalCard: { marginTop: spacing.md, marginBottom: spacing.lg },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { ...typography.label, color: colors.textPrimary },
  totalValue: { ...typography.h2, color: colors.primaryDeep },
  totalNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  continueShopping: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  continueShoppingLabel: { ...typography.label, color: colors.primaryBright },
});
