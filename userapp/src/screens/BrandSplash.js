import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../theme";
export default function BrandSplash() {
  return (
    <View style={styles.screen}>
      <Image
        source={require("../../assets/paprout-mark.png")}
        style={styles.mark}
        resizeMode="contain"
        accessibilityLabel="Paprout"
      />
      <Text style={styles.name}>Paprout</Text>
      <ActivityIndicator
        color={colors.primary}
        style={styles.loading}
        accessibilityLabel="Getting your print desk ready"
      />
      <Text style={styles.hint}>Getting your print desk ready</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  mark: { width: 92, height: 108 },
  name: { ...typography.h1, color: colors.ink, marginTop: 20 },
  tagline: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 8,
  },
  loading: { marginTop: 40 },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: 12 },
});
