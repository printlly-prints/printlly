import { Image, StyleSheet, Text, View } from "react-native";
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { width: 92, height: 108 },
  name: { ...typography.h1, color: colors.ink, marginTop: 20 },
});
