import { Image, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export default function PaperPreview() {
  return (
    <View style={styles.scene} pointerEvents="none" accessible={false}>
      <View style={styles.edge} />
      <Image
        source={require("../../assets/art/paper-pal-peeking.png")}
        style={styles.character}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { height: 154, alignItems: "center" },
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    borderTopWidth: 1.5,
    borderColor: colors.primary,
    opacity: 0.35,
  },
  character: { position: "absolute", bottom: 4, width: 146, height: 145 },
});
