import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { colors, typography, spacing, radius } from "../theme";

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Document handling</Text>
      <View style={styles.box}>
        <Text style={styles.paragraph}>
          Your uploaded documents are used only to fulfil your print order. Once an order is
          marked completed, the file is automatically deleted from our servers - it is never
          shared, sold, or kept around any longer than that.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.box}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Notifications</Text>
            <Text style={styles.rowNote}>Not wired up yet - has no effect</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.textPrimary}
          />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Language</Text>
            <Text style={styles.rowNote}>English only for now</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.lg },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  paragraph: { ...typography.body, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  rowText: { flex: 1, marginRight: spacing.md },
  rowLabel: { ...typography.bodyMedium, color: colors.textPrimary },
  rowNote: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
