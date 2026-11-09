import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";

export default function DocumentThumbnail({ colour = false, name = "" }) {
  const extension = name.split(".").pop().toUpperCase();
  const label = ["JPG", "JPEG", "PNG"].includes(extension) ? extension : "PDF";
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colour ? colors.pinkWash : colors.primaryWash },
      ]}
      accessible={false}
    >
      <View style={styles.page}>
        <View style={styles.title} />
        {[0, 1, 2, 3].map((n) => (
          <View key={n} style={styles.line} />
        ))}
      </View>
      <Text style={styles.badge}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  tile: {
    width: 44,
    height: 54,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    width: 29,
    height: 43,
    borderRadius: 3,
    backgroundColor: colors.surface,
    padding: 4,
    gap: 4,
  },
  title: {
    width: 15,
    height: 2,
    backgroundColor: colors.textSecondary,
    marginBottom: 2,
  },
  line: { height: 1.5, backgroundColor: colors.border },
  badge: {
    position: "absolute",
    right: 0,
    bottom: -2,
    backgroundColor: colors.ink,
    color: colors.surface,
    fontFamily: fonts.bodyMedium,
    fontSize: 7,
    lineHeight: 10,
    paddingHorizontal: 3,
    borderRadius: 2,
  },
});
