import { StyleSheet, Text, View } from "react-native";
import { colors, typography, spacing, fonts } from "../theme";

// The bill, and the one component allowed to render money.
//
// Every figure here comes from the server (POST /shops/compare-pricing
// priced this exact order at this exact shop, and POST /orders recomputes
// it from the same rates). Nothing is calculated in this file - that is
// the point: a total the app worked out itself is a total that can
// disagree with what the customer is charged.
//
// `rows` is [{ label, value, note, free }] and `total` is the figure the
// customer is agreeing to.
export default function PriceBreakdown({ rows, total, totalLabel = "Total", compact }) {
  return (
    <View>
      {rows.filter(Boolean).map((row) => (
        <View key={row.label} style={[styles.row, compact && styles.rowCompact]}>
          <View style={styles.labelColumn}>
            <Text style={styles.label}>{row.label}</Text>
            {/* The working, not just the answer: "10 pages x 1 copy x ₹2".
                A customer who can see why a line costs what it costs does
                not have to take the total on trust. */}
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
          </View>
          <Text style={[styles.value, row.free && styles.free]}>
            {row.free ? "FREE" : formatRupees(row.value)}
          </Text>
        </View>
      ))}

      {total !== undefined ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{totalLabel}</Text>
          <Text style={styles.totalValue}>{formatRupees(total)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Indian digit grouping, and decimals only when the amount actually has
// them - a flat per-page rate can produce ₹0.60, but ₹274.00 reads as
// noise next to ₹274.
export function formatRupees(value) {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowCompact: { paddingVertical: spacing.xs },
  labelColumn: { flex: 1 },
  label: { ...typography.bodySmall, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  value: { ...typography.bodySmall, color: colors.textPrimary },
  free: { color: colors.success, fontFamily: fonts.bodyMedium },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  totalLabel: { ...typography.label, color: colors.textPrimary },
  totalValue: { fontFamily: fonts.headingExtraBold, fontSize: 22, color: colors.primaryDeep },
});
