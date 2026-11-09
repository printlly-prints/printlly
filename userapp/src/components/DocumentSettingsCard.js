import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Stepper from "./Stepper";
import {
  describeDocumentSettings,
  sameServiceName,
} from "../utils/documentSettings";
import { colors, typography, spacing, radius, fonts } from "../theme";

// Convenient starting points, NOT a fixed set. Shops name their own
// services now ("Matte Lamination", "Hole Punching", "Perfect Binding"),
// so these are only the three most commonly asked for, pre-filled as
// text. Anything typed into the box below is equally valid - it is all
// just a name, matched against each shop's real list later.
//
// When the customer already picked a shop, its OWN service names are
// offered instead (see `availableServices` in the caller): suggesting
// "Lamination" to a shop that calls it "Glossy Lamination" would send
// them down a name that shop can't fulfil.
const COMMON_SERVICES = ["Spiral Binding", "Stapling", "Lamination"];

// One uploaded document and its own print settings. Collapsed it is a
// one-line summary of what will be printed; expanded it holds the full
// set of controls, every one of them scoped to this document alone.
//
// Collapsed by default past the first card: a customer with five files
// most often wants the same thing for all of them (that is what "Copy to
// all documents" is for), and five fully-expanded control sets is a very
// long screen to scroll past to reach Continue. The summary line means
// nothing is hidden - a differing document is visible without expanding
// it.
export default function DocumentSettingsCard({
  index,
  name,
  pageCount,
  settings,
  onChange,
  expanded,
  onToggleExpanded,
  onCopyToAll,
  showCopyToAll,
  estimate,
  availableServices,
  compact = false,
}) {
  const set = (patch) => onChange({ ...settings, ...patch });

  // What this document is asking for, as plain names. Matching them to a
  // specific shop's services (and prices) happens server-side, per shop.
  const requested = settings.services;

  // Quick-select suggestions: the chosen shop's real list when there is
  // one, otherwise the three most commonly asked for.
  const suggestions = availableServices?.length
    ? availableServices.map((service) => ({
        name: service.name,
        rate: service.rate,
      }))
    : COMMON_SERVICES.map((name) => ({ name, rate: null }));

  // Typed-in names that aren't among the suggestions - shown as removable
  // chips so the customer can see exactly what they asked for.
  const extras = requested.filter(
    (name) => !suggestions.some((s) => sameServiceName(s.name, name)),
  );

  const [draft, setDraft] = useState("");

  const toggleService = (name) =>
    set({
      services: requested.some((n) => sameServiceName(n, name))
        ? requested.filter((n) => !sameServiceName(n, name))
        : [...requested, name],
    });

  const addTypedService = () => {
    const name = draft.trim();
    // Silently ignoring a duplicate is right here: the customer's intent
    // ("I want lamination") is already recorded, and adding it twice would
    // be charged twice.
    if (name && !requested.some((n) => sameServiceName(n, name))) {
      set({ services: [...requested, name] });
    }
    setDraft("");
  };

  const controls = (
    <>
      <Field label="Colour">
        <Segmented
          value={settings.color_mode}
          onChange={(color_mode) => set({ color_mode })}
          options={[
            // "B&W" rather than "Black & White": the summary line
            // above already uses it, and a short label is what lets
            // the control fit beside its own label on a 320px screen.
            { value: "bw", label: "B&W" },
            { value: "color", label: "Colour" },
          ]}
        />
      </Field>

      <Field label="Copies">
        <Stepper value={settings.copies} onChange={(v) => set({ copies: v })} />
      </Field>

      <Field label="Paper">
        <Segmented
          value={settings.paper_size}
          onChange={(paper_size) => set({ paper_size })}
          options={[
            { value: "A4", label: "A4" },
            { value: "A3", label: "A3" },
          ]}
        />
      </Field>

      <Field label="Sides">
        <Segmented
          value={settings.sides}
          onChange={(sides) => set({ sides })}
          options={[
            { value: "single", label: "Single" },
            { value: "double", label: "Double" },
          ]}
        />
      </Field>
    </>
  );
  if (compact)
    return (
      <View style={styles.quickControls}>
        {name ? (
          <View style={styles.quickHeading}>
            <Text style={styles.quickEyebrow}>Settings for</Text>
            <Text numberOfLines={2} style={styles.quickName}>
              {name.replace(/\.pdf$/i, "")}
            </Text>
          </View>
        ) : null}
        <Segmented
          value={settings.color_mode}
          onChange={(color_mode) => set({ color_mode })}
          options={[
            { value: "bw", label: "Black & white" },
            { value: "color", label: "Colour" },
          ]}
        />
        <Segmented
          value={settings.sides}
          onChange={(sides) => set({ sides })}
          options={[
            { value: "single", label: "Single-sided" },
            { value: "double", label: "Double-sided" },
          ]}
        />
        <View style={styles.quickBottom}>
          <View style={styles.quickHalf}>
            <Text style={styles.quickLabel}>Paper size</Text>
            <Segmented
              value={settings.paper_size}
              onChange={(paper_size) => set({ paper_size })}
              options={[
                { value: "A4", label: "A4" },
                { value: "A3", label: "A3" },
              ]}
            />
          </View>
          <View style={styles.quickHalf}>
            <Text style={styles.quickLabel}>Copies</Text>
            <Stepper
              value={settings.copies}
              onChange={(copies) => set({ copies })}
            />
          </View>
        </View>
      </View>
    );

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={onToggleExpanded}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name || `Document ${index + 1}`}
          </Text>
          <Text style={styles.meta}>
            {pageCount} page{pageCount === 1 ? "" : "s"}
            {estimate ? ` · ₹${estimate.document_total}` : ""}
          </Text>
          {/* Shown whether open or closed: when open it confirms the
              choices without scrolling back, when closed it is the only
              way to see them. */}
          <Text style={styles.summary}>
            {describeDocumentSettings(settings)}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {/* Label beside the control rather than above it. With a card
              per document these four blocks were eight lines of vertical
              space each time; as rows they are four. The labels are short
              enough to sit in a fixed column, which also lines all four
              controls up with each other. */}
          {controls}

          <Text style={styles.label}>Additional services (optional)</Text>
          <Text style={styles.serviceHint}>
            {availableServices?.length
              ? "What this shop offers, or type your own."
              : "We'll only show shops that offer these."}
          </Text>

          <View style={styles.servicesBox}>
            {suggestions.map((service, i) => {
              const checked = requested.some((n) =>
                sameServiceName(n, service.name),
              );
              return (
                <Pressable
                  key={service.name}
                  style={[styles.serviceRow, i > 0 && styles.serviceRowBorder]}
                  onPress={() => toggleService(service.name)}
                >
                  <View
                    style={[styles.checkbox, checked && styles.checkboxChecked]}
                  >
                    {checked ? (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={colors.surface}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.serviceLabel}>{service.name}</Text>
                  {/* A price only exists once a shop is chosen - the
                      suggestions otherwise have no shop behind them. */}
                  {service.rate !== null ? (
                    <Text style={styles.serviceRate}>₹{service.rate}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Anything at all, typed. Kept separate from the checkboxes so
              it's clear these aren't a menu the shop must match exactly. */}
          <View style={styles.addServiceRow}>
            <TextInput
              style={styles.addServiceInput}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addTypedService}
              placeholder="Add another service"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              autoCapitalize="words"
            />
            <Pressable
              style={[
                styles.addServiceButton,
                !draft.trim() && styles.addServiceButtonDisabled,
              ]}
              onPress={addTypedService}
              disabled={!draft.trim()}
            >
              <Ionicons
                name="add"
                size={20}
                color={draft.trim() ? colors.surface : colors.textMuted}
              />
            </Pressable>
          </View>

          {extras.length > 0 ? (
            <View style={styles.chipRow}>
              {extras.map((name) => (
                <Pressable
                  key={name}
                  style={styles.chip}
                  onPress={() => toggleService(name)}
                >
                  <Text style={styles.chipLabel}>{name}</Text>
                  <Ionicons name="close" size={14} color={colors.primaryDeep} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Only offered when there is more than one document, and worded
              as the one-way action it is - it overwrites the others. */}
          {showCopyToAll ? (
            <Pressable style={styles.copyRow} onPress={onCopyToAll}>
              <Ionicons
                name="copy-outline"
                size={16}
                color={colors.primaryBright}
              />
              <Text style={styles.copyLabel}>
                Apply these settings to all documents
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// One labelled control row: a fixed-width label column and the control
// filling the rest. The fixed column is what keeps the four controls
// aligned with each other instead of each starting wherever its own
// label happens to end.
function Field({ label, children }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldControl}>{children}</View>
    </View>
  );
}

// A two-option segmented control: one bordered container split in half,
// rather than two separately bordered buttons. It reads as a single
// choice rather than two independent things, and it saves the gap and
// the second border the old pair spent.
//
// Selection is carried by the filled segment AND by its heavier type -
// two signals, so the control is still readable without colour vision.
// accessibilityState carries it to screen readers, which see neither.
function Segmented({ value, onChange, options }) {
  return (
    <View style={styles.segmented}>
      {options.map((option, i) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={[
              styles.segment,
              i > 0 && styles.segmentDivider,
              selected && styles.segmentSelected,
            ]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  quickControls: { gap: spacing.lg },
  quickHeading: { gap: spacing.sm },
  quickEyebrow: {
    ...typography.labelSmall,
    color: colors.textSecondary,
  },
  quickName: { ...typography.bodyMedium, color: colors.ink },
  quickBottom: { flexDirection: "row", gap: spacing.md },
  quickHalf: { flex: 1, gap: spacing.sm, minWidth: 0 },
  quickLabel: { ...typography.caption, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    // Trimmed from spacing.lg: this block IS a collapsed card, so with
    // four documents it is paid four times over.
    paddingVertical: spacing.md,
  },
  headerText: { flex: 1 },
  name: { ...typography.label, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  summary: {
    ...typography.caption,
    color: colors.primaryDeep,
    marginTop: spacing.xs,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  label: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  // Fixed, not flexed: every control then starts at the same x, which is
  // what makes four rows read as one group instead of four.
  fieldLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    width: 62,
  },
  fieldControl: { flex: 1, flexDirection: "row", alignItems: "center" },
  segmented: {
    flex: 1,
    flexDirection: "row",
    // 40 is the floor for a control that still has to be tapped
    // accurately. Everything else here shrank; this did not.
    height: 44,
    borderRadius: 16,
    padding: 3,
    backgroundColor: colors.backgroundSoft,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: 12,
  },
  segmentDivider: {},
  segmentSelected: { backgroundColor: colors.primaryWash },
  segmentLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  segmentLabelSelected: {
    fontFamily: fonts.headingSemiBold,
 color: colors.primaryDeep,
  },
  servicesBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    // ~41px tall. The row spans the card, so it is an easy target even
    // at this height - width does the work a taller box would.
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm + 2,
  },
  serviceRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  serviceLabel: { ...typography.bodySmall, color: colors.textPrimary, flex: 1 },
  serviceRate: { ...typography.bodySmall, color: colors.textSecondary },
  serviceHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  addServiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addServiceInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    ...typography.bodySmall,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  addServiceButton: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addServiceButtonDisabled: { backgroundColor: colors.border },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryWash,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  chipLabel: { ...typography.labelSmall, color: colors.primaryDeep },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  copyLabel: { ...typography.labelSmall, color: colors.primaryBright },
});
