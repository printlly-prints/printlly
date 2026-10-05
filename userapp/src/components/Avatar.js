import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";

// Initials-based circle avatar - there is no photo upload feature, so a
// real image is never available to show here.
export default function Avatar({ name, size = 40 }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    fontFamily: fonts.headingBold,
    color: colors.primaryDeep,
  },
});
