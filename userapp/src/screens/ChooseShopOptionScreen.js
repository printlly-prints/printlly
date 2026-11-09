import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ShopPhoto from "../components/ShopPhoto";
import { shopImageSource } from "../utils/shopImages";
import api from "../api/client";
import { useLocation } from "../context/LocationContext";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { selectableQuote } from "../utils/quoteSelection";
import { colors, typography, spacing, radius } from "../theme";

// Shown only when the customer entered the flow from one shop's page
// ("Print here"), between preferences and checkout.
export default function ChooseShopOptionScreen({ route, navigation }) {
  const { uploadedDocs, docSettings, notes, preselectedShop } = route.params;
  const { coords } = useLocation();

  const [checking, setChecking] = useState(true);
  const [quote, setQuote] = useState(null);
  const [note, setNote] = useState("");

  const goCompare = () =>
    navigation.navigate("SelectShop", { uploadedDocs, docSettings, notes, preselectedShop });

  // Asked up front so a shop that can't take this order is never offered.
  // Same endpoint and gates as the comparison, narrowed to this one shop.
  useEffect(() => {
    let active = true;
    setChecking(true);
    setNote("");
    api
      .post("/shops/compare-pricing", {
        documents: toComparePricingDocuments(uploadedDocs, docSettings),
        shop_id: preselectedShop._id,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      })
      .then(({ data }) => {
        if (!active) return;
        const result = selectableQuote(data?.[0]) ? data[0] : null;
        setQuote(result);
        if (!result) setNote(`${preselectedShop.shop_name} can't take this order right now.`);
      })
      .catch((err) => {
        if (!active) return;
        setQuote(null);
        setNote(err.response?.data?.message || "Could not get a price. Check your connection.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [uploadedDocs, docSettings, preselectedShop._id, preselectedShop.shop_name, coords]);

  // Exactly the shape SelectShopScreen hands over, so there is only one
  // checkout to keep correct.
  const orderDirectly = () =>
    navigation.navigate("Checkout", {
      uploadedDocs,
      docSettings,
      notes,
      shop: {
        _id: quote.shop_id,
        shop_name: quote.shop_name,
        address: quote.address,
        shop_photo_url: quote.shop_photo_url,
      },
      priceBreakdown: quote.price_breakdown,
      totalAmount: quote.total_amount,
      documentTotals: quote.document_totals,
      documentServices: quote.document_services,
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[styles.title, styles.titleSpaced]}>How would you like to order?</Text>

      {checking ? (
        <ActivityIndicator color={colors.primaryBright} style={styles.checking} />
      ) : quote ? (
        <Option
          icon="storefront-outline"
          title={`Order from ${preselectedShop.shop_name}`}
          body="Go straight to checkout."
          onPress={orderDirectly}
          shop={preselectedShop}
        />
      ) : (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>{note}</Text>
        </View>
      )}

      <Option
        icon="swap-horizontal-outline"
        title="Compare nearby shops"
        body="See prices at every shop that can print this."
        onPress={goCompare}
      />
    </ScrollView>
  );
}

// Both options are the same size and weight on purpose. Making the direct
// one the big primary button would be nudging the customer out of
// comparing, which is the part of this product that saves them money.
function Option({ icon, title, body, onPress, shop }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.optionHeader}>
        {shop ? (
          <ShopPhoto source={shopImageSource(shop)} shopName={shop.shop_name} style={styles.optionPhoto} iconSize={18} />
        ) : (
          <View style={styles.optionIcon}>
            <Ionicons name={icon} size={20} color={colors.primaryBright} />
          </View>
        )}
        <Text style={styles.optionTitle}>{title}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
      <Text style={styles.optionBody}>{body}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  titleSpaced: { marginBottom: spacing.lg },
  checking: { marginVertical: spacing.xl },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  optionPressed: { backgroundColor: colors.primaryWash, borderColor: colors.primary },
  optionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  // ShopPhoto defaults to a full-width block; this pins it to a small
  // square that matches the icon circle beside it on the other option.
  optionPhoto: { width: 36, height: 36, borderRadius: radius.sm },
  optionTitle: { ...typography.label, color: colors.textPrimary, flex: 1 },
  optionBody: {
    ...typography.bodySmall,
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
