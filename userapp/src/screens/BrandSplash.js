import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, typography, spacing, radius } from "../theme";

const STEPS = [
  { icon: "document-text-outline", label: "Upload" },
  { icon: "print-outline", label: "Print" },
  { icon: "bag-check-outline", label: "Pick Up" },
];

// The screen the customer sees while the app starts: fonts loading and
// the stored session being read back from AsyncStorage. Held for a short
// minimum in App.js so it reads as a deliberate brand moment rather than
// a flash of teal.
//
// Deliberately no fake status bar - the real one renders on top of this,
// and a painted one would sit under it doubled up.
export default function BrandSplash() {
  return (
    <View style={styles.screen}>
      {/* Soft teal wash shapes. Circles rather than SVG paths -
          react-native-svg isn't a dependency, and at this blur/scale the
          difference isn't visible. */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <View style={styles.center}>
        {/* The lockup already carries the wordmark and the tagline, so
            neither is repeated as text here. */}
        <Image
          source={require("../../assets/printlly-lockup.png")}
          style={styles.lockup}
          resizeMode="contain"
          accessibilityLabel="Printlly — Print Smarter. Skip the Wait."
        />

        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={colors.primaryBright} />
          <Text style={styles.loadingText}>Loading your experience...</Text>
        </View>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.label} style={styles.stepGroup}>
              {i > 0 && <View style={styles.stepConnector} />}
              <View style={styles.step}>
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={20} color={colors.primaryBright} />
                </View>
                <Text style={styles.stepLabel}>{step.label}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.footer}>Same Documents. Better Days.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  blobTop: {
    position: "absolute",
    top: -190,
    left: -130,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: colors.primaryWash,
    opacity: 0.75,
  },
  blobBottom: {
    position: "absolute",
    bottom: -210,
    right: -140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.primaryWash,
    opacity: 0.75,
  },
  center: { alignItems: "center", paddingHorizontal: spacing.xl },
  lockup: { width: 236, height: 236 },
  loadingBlock: { alignItems: "center", marginTop: spacing.xxxl, gap: spacing.md },
  loadingText: { ...typography.bodySmall, color: colors.textSecondary },
  steps: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing.section },
  stepGroup: { flexDirection: "row", alignItems: "center" },
  stepConnector: {
    width: 28,
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 22,
  },
  step: { alignItems: "center", gap: spacing.sm, width: 76 },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { ...typography.caption, color: colors.textSecondary },
  footer: {
    position: "absolute",
    bottom: 56,
    ...typography.labelSmall,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
