import { Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { orderJourney } from "../utils/orderJourney";
import { colors, typography, spacing } from "../theme";
const MASCOTS = {
  accepted: require("../../assets/art/paper-pal-cmyk.png"),
  printing: require("../../assets/art/paper-pal-pending.png"),
  ready: require("../../assets/art/paper-pal-success.png"),
};
export default function OrderJourney({
  status,
  compact = false,
  illustrated = true,
}) {
  const phase = orderJourney(status);
  return (
    <View style={[styles.root, compact && styles.compact]}>
      <View style={{ flex: 1 }}>
        {!compact ? (
          <View style={styles.heading}>
            <Text style={styles.title}>{phase.title}</Text>
            <Text style={styles.description}>{phase.description}</Text>
          </View>
        ) : null}
        <View style={styles.steps}>
          {["Accepted", "Printing", "Ready"].map((label, index) => (
            <View key={label} style={styles.step}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.line,
                    index > 0 && index <= phase.stage && styles.doneLine,
                    index === 0 && { opacity: 0 },
                  ]}
                />
                <View
                  style={[styles.dot, index <= phase.stage && styles.doneDot]}
                >
                  {index <= phase.stage ? (
                    <Ionicons
                      name={
                        index === phase.stage && phase.stage < 2
                          ? "ellipsis-horizontal"
                          : "checkmark"
                      }
                      size={9}
                      color={colors.onPrimary}
                    />
                  ) : null}
                </View>
                <View
                  style={[
                    styles.line,
                    index < phase.stage && styles.doneLine,
                    index === 2 && { opacity: 0 },
                  ]}
                />
              </View>
              <Text
                style={[styles.label, index <= phase.stage && styles.doneLabel]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {illustrated ? (
        <Image
          source={MASCOTS[phase.art]}
          resizeMode="contain"
          style={styles.mascot}
          accessible={false}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryWash,
    borderRadius: 22,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  compact: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  heading: { gap: spacing.xs, marginBottom: spacing.md },
  title: { ...typography.label, color: colors.primaryDeep },
  description: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  mascot: { width: 44, height: 48 },
  steps: { flexDirection: "row", paddingVertical: spacing.xs },
  step: { flex: 1, alignItems: "center", gap: spacing.xs },
  track: { flexDirection: "row", alignItems: "center", width: "100%" },
  line: { height: 2, flex: 1, backgroundColor: colors.borderStrong },
  doneLine: { backgroundColor: colors.primary },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  doneDot: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { ...typography.caption, fontSize: 10, color: colors.textSecondary },
  doneLabel: { color: colors.primaryDeep },
});
