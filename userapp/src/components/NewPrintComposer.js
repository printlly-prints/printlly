import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Button from "./Button";
import PaperFlight from "./PaperFlight";
import { colors, typography, spacing, radius } from "../theme";

export default function NewPrintComposer({
  onPress,
  loading = false,
  title = "Start a print",
  label = "Add documents",
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.composer}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.body}>
            Add your PDF. Choose a shop. Pick it up.
          </Text>
        </View>
        {fontScale < 1.5 ? (
          <View style={styles.scene} pointerEvents="none">
            <Image
              source={require("../../assets/art/paper-pal-cmyk.png")}
              resizeMode="contain"
              style={styles.mascot}
              accessible={false}
            />
            <PaperFlight style={styles.flight} />
          </View>
        ) : null}
      </View>
      <View style={styles.action}>
        <Button
          title={label}
          icon="add"
          iconPosition="left"
          onPress={onPress}
          loading={loading}
        />
        <Text style={styles.note}>PDF documents</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  composer: {
    backgroundColor: colors.primaryWash,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 186,
    overflow: "hidden",
  },
  row: { flexDirection: "row", gap: spacing.sm },
  copy: { flex: 1, paddingTop: spacing.xs },
  title: { ...typography.h2, color: colors.ink },
  body: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    maxWidth: 210,
  },
  scene: { width: 100, height: 104 },
  mascot: { position: "absolute", right: -7, top: 22, width: 84, height: 108 },
  flight: {
    position: "absolute",
    right: 2,
    top: -6,
    transform: [{ scale: 0.46 }],
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  note: { ...typography.caption, color: colors.primaryDeep, flexShrink: 1 },
});
