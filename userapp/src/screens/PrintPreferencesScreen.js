import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Button from "../components/Button";
import DocumentSettingsCard from "../components/DocumentSettingsCard";
import api from "../api/client";
import { defaultDocumentSettings } from "../utils/documentSettings";
import { estimateOrder } from "../utils/estimatePricing";
import { colors, typography, spacing, radius } from "../theme";

// Step 2 of the order flow. Every uploaded document is configured
// SEPARATELY - colour mode, copies, paper size, sides and services are
// per document on the backend (see utils/orderDocuments.js there), so a
// customer can send a 40-page B&W handout and a laminated colour poster
// as one order.
//
// The "Additional notes" field is the same `instructions` field POST
// /orders has always accepted, and stays order-wide: it is a message to
// the shop, not a print setting.
export default function PrintPreferencesScreen({ route, navigation }) {
  const { uploadedDocs, preselectedShop } = route.params;

  // One settings object per uploaded document, positionally matched to
  // uploadedDocs - the same array shape the rest of the flow and the API
  // both expect.
  const [docSettings, setDocSettings] = useState(() =>
    uploadedDocs.map(() => defaultDocumentSettings())
  );
  const [notes, setNotes] = useState("");
  // Only the first card starts open - see DocumentSettingsCard's comment.
  const [expandedIndex, setExpandedIndex] = useState(0);

  const updateDoc = (index, next) =>
    setDocSettings((prev) => prev.map((s, i) => (i === index ? next : s)));

  const copyToAll = (index) =>
    setDocSettings((prev) => {
      const source = prev[index];
      // services is an ARRAY of names now - spreading it as an object
      // would turn ["Lamination"] into { 0: "Lamination" }.
      return prev.map(() => ({ ...source, services: [...source.services] }));
    });

  // A live estimate is only possible when this shop's rates are actually
  // known - which is the case when the customer came in from a specific
  // shop (its full profile, pricing included, rides along in
  // preselectedShop). Coming in from "Upload Document" with no shop
  // chosen yet, there is genuinely nothing to estimate from: rates are
  // per shop, and inventing a number would be worse than showing none.
  const shopPricing = preselectedShop?.pricing || null;

  // The chosen shop's own service list, by name and price. Without a shop
  // there is nothing to offer: services are vendor-defined, so "which
  // services can I have" has no answer until a shop is picked. The
  // customer chooses them at the Select-shop step in that case.
  const availableServices = (shopPricing?.services || []).filter((s) => s.enabled !== false);

  // platform_fee is the one global figure (GET /pricing-config). Fetched
  // only when there is a shop to price against - without it the estimate
  // below stops at the pre-fee total and says so, rather than quietly
  // understating what the customer will pay.
  const [platformFee, setPlatformFee] = useState(null);
  useEffect(() => {
    if (!shopPricing) return undefined;
    let cancelled = false;
    api
      .get("/pricing-config")
      .then(({ data }) => {
        if (!cancelled) setPlatformFee(data);
      })
      .catch(() => {
        // Estimate simply stops before the fee - not worth an error here.
      });
    return () => {
      cancelled = true;
    };
  }, [shopPricing]);

  const estimate = useMemo(
    () => estimateOrder(uploadedDocs, docSettings, shopPricing, platformFee),
    [uploadedDocs, docSettings, shopPricing, platformFee]
  );

  // Where "Continue" goes depends on how the customer got here.
  //
  // From a shop's own page ("Print here"), there IS a shop in mind, so
  // they are asked whether to compare or just order from it - skipping
  // comparison is a real decision and gets its own screen rather than
  // being assumed either way.
  //
  // From Home's "Upload document" there is no shop yet, nothing to
  // choose between, and asking would be a pointless extra tap - so that
  // path goes straight to the comparison, exactly as it always has.
  const handleContinue = () => {
    const params = { uploadedDocs, docSettings, notes: notes.trim(), preselectedShop };
    navigation.navigate(preselectedShop ? "ChooseShopOption" : "SelectShop", params);
  };

  const multiple = uploadedDocs.length > 1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Print preferences</Text>
      <Text style={styles.subtitle}>
        {multiple
          ? "Set these separately for each document — tap one to open it."
          : "Choose how this document should be printed."}
      </Text>

      {uploadedDocs.map((doc, index) => (
        <DocumentSettingsCard
          key={doc.upload_id}
          index={index}
          name={doc.original_name}
          pageCount={doc.page_count}
          settings={docSettings[index]}
          onChange={(next) => updateDoc(index, next)}
          expanded={expandedIndex === index}
          onToggleExpanded={() => setExpandedIndex((cur) => (cur === index ? -1 : index))}
          onCopyToAll={() => copyToAll(index)}
          showCopyToAll={multiple}
          estimate={estimate?.documents[index]}
          availableServices={availableServices}
        />
      ))}

      {!shopPricing ? (
        <Text style={styles.servicesNote}>
          Finishing services (binding, lamination and so on) vary by shop &mdash; you&apos;ll be able to
          add them once you&apos;ve chosen one.
        </Text>
      ) : null}

      <Text style={styles.label}>Additional notes (optional)</Text>
      <Text style={styles.helperText}>Applies to the whole order, not one document.</Text>
      <TextInput
        style={styles.textArea}
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything else the shop should know"
        placeholderTextColor={colors.textMuted}
        multiline
      />

      {estimate ? (
        <View style={styles.estimateBox}>
          <Text style={styles.estimateTitle}>Estimated at {preselectedShop.shop_name}</Text>
          {uploadedDocs.map((doc, i) => (
            <View key={doc.upload_id} style={styles.estimateRow}>
              <Text style={styles.estimateLabel} numberOfLines={1}>
                {doc.original_name || `Document ${i + 1}`}
              </Text>
              <Text style={styles.estimateValue}>₹{estimate.documents[i].document_total}</Text>
            </View>
          ))}
          {estimate.platform_fee !== null ? (
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Platform fee</Text>
              <Text style={styles.estimateValue}>₹{estimate.platform_fee}</Text>
            </View>
          ) : null}
          <View style={[styles.estimateRow, styles.estimateTotalRow]}>
            <Text style={styles.estimateTotalLabel}>
              {estimate.total_amount === null ? "Before fees" : "Estimated total"}
            </Text>
            <Text style={styles.estimateTotalValue}>
              ₹{estimate.total_amount === null ? estimate.pre_fee_total : estimate.total_amount}
            </Text>
          </View>
          {/* Said plainly: this shop's rates are known, but the customer
              can still pick a different shop on the next screen, and the
              charge is always recomputed server-side. */}
          <Text style={styles.estimateNote}>
            Compare other shops on the next screen — the final price is confirmed before you pay.
          </Text>
        </View>
      ) : (
        <Text style={styles.pricingNote}>
          Each shop sets its own rates — you&apos;ll see prices from nearby shops on the next screen.
        </Text>
      )}

      <View style={styles.spacer} />
      <Button title="Continue" onPress={handleContinue} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { ...typography.label, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.xs },
  helperText: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  servicesNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.textPrimary,
    textAlignVertical: "top",
    marginBottom: spacing.lg,
  },
  estimateBox: {
    backgroundColor: colors.primaryWash,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  estimateTitle: { ...typography.labelSmall, color: colors.primaryDeep, marginBottom: spacing.sm },
  estimateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 3,
  },
  estimateLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  estimateValue: { ...typography.bodySmall, color: colors.textPrimary },
  estimateTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  estimateTotalLabel: { ...typography.label, color: colors.textPrimary },
  estimateTotalValue: { ...typography.label, color: colors.primaryDeep },
  estimateNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  pricingNote: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center" },
  spacer: { height: spacing.md },
});
