import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ShopPhoto from "../components/ShopPhoto";
import api from "../api/client";
import { useLocation } from "../context/LocationContext";
import { toComparePricingDocuments } from "../utils/documentSettings";
import { typography, spacing, radius } from "../theme";
import ScreenFrame from "../components/ScreenFrame";
import { useTheme, useThemedStyles } from "../context/ThemeContext";

// Shown ONLY when the customer entered the flow from one particular
// shop's page ("Print here"), between preferences and checkout. Coming in
// from Home's "Upload document" there is no shop yet, nothing to offer,
// and PrintPreferences goes straight to SelectShop as it always did.
//
// The whole screen exists because skipping comparison is a real decision
// with a real cost - another shop may be cheaper - and it should be made
// deliberately rather than by a flow that quietly stopped comparing.
// So neither option is styled as the obvious one, and the direct option
// says in as many words what the customer gives up.
export default function ChooseShopOptionScreen({ route, navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const { uploadedDocs, docSettings, notes, preselectedShop } = route.params;
  const { coords } = useLocation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const goCompare = () =>
    navigation.navigate("SelectShop", { uploadedDocs, docSettings, notes, preselectedShop });

  // The direct path still gets a real, server-computed quote - the same
  // endpoint every other quote comes from, just narrowed to this one shop
  // (see comparePricing's shop_id filter). Nothing is priced client-side:
  // the estimate on the previous screen is an estimate, and what the
  // customer is about to agree to has to be the server's number.
  const orderDirectly = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/shops/compare-pricing", {
        documents: toComparePricingDocuments(uploadedDocs, docSettings),
        shop_id: preselectedShop._id,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });

      const result = data?.[0];
      if (!result) {
        // The shop is gone, deactivated, or can't do one of the services
        // asked for - the same gates the comparison applies. Comparison
        // is the honest fallback: some other shop probably can.
        setError(
          `${preselectedShop.shop_name} can't take this order right now. Compare other shops to see who can.`
        );
        return;
      }

      // Exactly the shape SelectShopScreen hands over, so ReviewCheckout
      // cannot tell the two paths apart and there is only one checkout to
      // keep correct.
      navigation.navigate("ReviewCheckout", {
        uploadedDocs,
        docSettings,
        notes,
        shop: {
          _id: result.shop_id,
          shop_name: result.shop_name,
          address: result.address,
          shop_photo_url: result.shop_photo_url,
        },
        priceBreakdown: result.price_breakdown,
        totalAmount: result.total_amount,
        documentTotals: result.document_totals,
        documentServices: result.document_services,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Could not get a price. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const fileCount = uploadedDocs.length;

  return (
    <ScreenFrame title="Choose print shop" onBack={() => navigation.goBack()}>
      <Text style={styles.title}>How would you like to order?</Text>
      <Text style={styles.subtitle}>
        You started from {preselectedShop.shop_name}. You can order there, or check what other shops
        would charge for the same {fileCount === 1 ? "document" : `${fileCount} documents`} first.
      </Text>

      <Option
        icon="swap-horizontal-outline"
        title="Compare prices at other shops"
        body={`See what every nearby shop would charge, sorted by price. ${preselectedShop.shop_name} will be in the list — you can still pick it.`}
        onPress={goCompare}
        disabled={loading}
      />

      <Option
        icon="storefront-outline"
        title={`Order from ${preselectedShop.shop_name} now`}
        // The one thing the customer needs to weigh, stated plainly
        // rather than implied by the absence of a comparison screen.
        body="Straight to checkout. You'll only see prices from this shop, so you won't know if another one is cheaper."
        onPress={orderDirectly}
        disabled={loading}
        loading={loading}
        shop={preselectedShop}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </ScreenFrame>
  );
}

// Both options are the same size and weight on purpose. Making the direct
// one the big primary button would be nudging the customer out of
// comparing, which is the part of this product that saves them money.
function Option({ icon, title, body, onPress, disabled, loading, shop }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && !disabled && styles.optionPressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <View style={styles.optionHeader}>
        {shop ? (
          <ShopPhoto source={shop.shop_photo_url ? { uri: shop.shop_photo_url } : null} shopName={shop.shop_name} style={styles.optionPhoto} iconSize={18} />
        ) : (
          <View style={styles.optionIcon}>
            <Ionicons name={icon} size={20} color={colors.primaryBright} />
          </View>
        )}
        <Text style={styles.optionTitle}>{title}</Text>
        {loading ? (
          <ActivityIndicator color={colors.primaryBright} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        )}
      </View>
      <Text style={styles.optionBody}>{body}</Text>
    </Pressable>
  );
}

const createStyles = ({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
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
    marginTop: spacing.sm,
  },
  errorText: { ...typography.bodySmall, color: colors.danger },
});
