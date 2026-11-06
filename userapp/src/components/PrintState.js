import { Image, StyleSheet, Text, View } from "react-native";
import Button from "./Button";
import { colors, typography, spacing } from "../theme";

const artwork = {
  offline: require("../../assets/art/paper-pal-offline.png"),
  empty: require("../../assets/art/paper-pal-empty.png"),
  success: require("../../assets/art/paper-pal-success.png"),
  pending: require("../../assets/art/paper-pal-pending.png"),
};
export default function PrintState({
  kind = "empty",
  title,
  body,
  action,
  onAction,
}) {
  return (
    <View style={styles.state}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Image
          source={artwork[kind] || artwork.empty}
          style={styles.art}
          resizeMode="contain"
          accessible={false}
        />
      </View>
      <Text
        accessibilityRole={kind === "offline" ? "alert" : undefined}
        style={styles.body}
      >
        {body}
      </Text>
      {action && onAction ? (
        <Button
          title={action}
          onPress={onAction}
          variant="secondary"
          icon="arrow-forward"
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  state: {
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...typography.h2, color: colors.ink, flex: 1 },
  art: { width: 106, height: 124 },
  body: { ...typography.bodySmall, color: colors.textSecondary },
});
