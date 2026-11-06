import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import DocumentThumbnail from "./DocumentThumbnail";
import { formatRupees } from "./PriceBreakdown";
import { colors, typography, spacing, radius, fonts } from "../theme";

// One document in the cart / order summary.
//
// There is no real thumbnail to show: uploads are PDFs stored as
// Cloudinary raw assets with no rendered preview, and the app never
// downloads the file itself. So this draws a document glyph rather than
// a fake page image - the reference's thumbnails are of documents that
// were never rendered by this product.
//
// `editable` turns on the copies stepper and the remove button. The
// order summary on a placed order passes it false: that order is fixed,
// and offering controls that cannot change it would be a lie about what
// the screen can do.
export default function CartItem({
  name,
  pageCount,
  settings,
  copies,
  perPageRate,
  services,
  total,
  editable,
  onChangeCopies,
  onRemove,
  canRemove,
}) {
  const bw = settings?.color_mode !== "color";
  const descriptor = [
    settings?.paper_size || "A4",
    bw ? "Black & White" : "Colour",
    `${pageCount} page${pageCount === 1 ? "" : "s"}`,
    settings?.sides === "double" ? "Double-sided" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <DocumentThumbnail colour={!bw} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name || "Document"}
        </Text>
        <Text style={styles.descriptor}>{descriptor}</Text>

        {/* The rate this shop charges for THIS document's colour mode -
            only once a shop is chosen, since there is no such thing as a
            price before then. */}
        {typeof perPageRate === "number" ? (
          <Text style={styles.rate}>{formatRupees(perPageRate)} per page</Text>
        ) : null}

        {/* Services are named as the SHOP matched them, with the rate it
            will actually charge. */}
        {(services || []).length > 0 ? (
          <View style={styles.serviceRow}>
            {services.map((service) => (
              <View
                key={service.service_id || service.name}
                style={styles.serviceChip}
              >
                <Text style={styles.serviceText}>
                  {service.name}
                  {typeof service.rate === "number"
                    ? ` ${formatRupees(service.rate)}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {editable ? (
          <View style={styles.controls}>
            <Stepper value={copies} onChange={onChangeCopies} />
            {canRemove ? (
              <Pressable
                onPress={onRemove}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.remove,
                  pressed && styles.removePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${name}`}
              >
                <Ionicons
                  name="trash-outline"
                  size={17}
                  color={colors.danger}
                />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={styles.copiesStatic}>
            {copies} cop{copies === 1 ? "y" : "ies"}
          </Text>
        )}
      </View>

      <View style={styles.priceColumn}>
        {typeof total === "number" ? (
          <Text style={styles.price}>{formatRupees(total)}</Text>
        ) : null}
        {/* The working, spelled out - section 19's whole point. */}
        {typeof total === "number" && typeof perPageRate === "number" ? (
          <Text style={styles.workings}>
            {pageCount} × {copies} × {formatRupees(perPageRate)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// Small inline stepper, sized to sit inside a card row rather than the
// full-width one on the preferences screen.
function Stepper({ value, onChange }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        hitSlop={6}
        style={({ pressed }) => [
          styles.step,
          pressed && styles.stepPressed,
          value <= 1 && styles.stepOff,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Decrease copies"
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(999, value + 1))}
        hitSlop={6}
        style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
        accessibilityRole="button"
        accessibilityLabel="Increase copies"
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  thumb: {
    width: 46,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryWash,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  name: { ...typography.bodyMedium, color: colors.textPrimary },
  descriptor: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rate: { ...typography.caption, color: colors.textMuted, marginTop: 1 },

  serviceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  serviceChip: {
    backgroundColor: colors.successBg,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  serviceText: { ...typography.caption, color: colors.success },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  copiesStatic: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  step: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPressed: { backgroundColor: colors.primaryWash },
  stepOff: { opacity: 0.4 },
  stepGlyph: { fontSize: 17, lineHeight: 20, color: colors.primaryBright },
  stepValue: {
    minWidth: 28,
    textAlign: "center",
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  remove: {
    width: 34,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  removePressed: { backgroundColor: colors.dangerBg },

  priceColumn: { alignItems: "flex-end", minWidth: 64 },
  price: { ...typography.bodyMedium, color: colors.textPrimary },
  workings: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: "right",
  },
});
