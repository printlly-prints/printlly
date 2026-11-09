import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "pressto";
import Ionicons from "@expo/vector-icons/Ionicons";
import { toast } from "react-native-sonner";
import config from "../../app.json";
import { colors, typography, spacing } from "../theme";

export default function SettingsScreen() {
  const openSettings = () =>
    Linking.openSettings().catch(() =>
      toast.error("Couldn't open device settings"),
    );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.privacyIcon}>
        <Ionicons
          name="shield-checkmark-outline"
          size={28}
          color={colors.primary}
        />
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Your files are private
      </Text>
      <Text style={styles.paragraph}>
        We delete them when your order is completed.
      </Text>
      <Text style={styles.section}>APP PREFERENCES</Text>
      {Platform.OS !== "web" ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Open device permissions"
          onPress={openSettings}
          style={styles.row}
        >
          <Ionicons
            name="phone-portrait-outline"
            size={22}
            color={colors.primary}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>Device permissions</Text>
            <Text style={styles.note}>
              Manage Paprout’s access in your device settings
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </PressableScale>
      ) : null}
      <View style={styles.row}>
        <Ionicons name="language-outline" size={22} color={colors.primary} />
        <Text style={[styles.label, styles.copy]}>Language</Text>
        <Text style={styles.note}>English</Text>
      </View>
      <View style={styles.row}>
        <Ionicons
          name="information-circle-outline"
          size={22}
          color={colors.primary}
        />
        <Text style={[styles.label, styles.copy]}>Paprout</Text>
        <Text style={styles.note}>Version {config.expo.version}</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  privacyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryWash,
    marginBottom: spacing.lg,
  },
  title: { ...typography.h2, color: colors.ink, marginBottom: spacing.md },
  paragraph: { ...typography.bodySmall, color: colors.textSecondary },
  section: {
    ...typography.labelSmall,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 76,
    paddingVertical: spacing.md,
  },
  copy: { flex: 1, gap: spacing.xs },
  label: { ...typography.bodyMedium, color: colors.ink },
  note: { ...typography.caption, color: colors.textSecondary },
});
