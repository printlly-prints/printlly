import { StyleSheet, View } from "react-native";
import Animated, {
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { useIsFocused } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";

const flight = {
  "0%": {
    opacity: 0,
    transform: [{ translateX: -50 }, { translateY: 90 }, { rotate: "-25deg" }],
  },
  "15%": {
    opacity: 1,
    transform: [{ translateX: -30 }, { translateY: 55 }, { rotate: "-20deg" }],
  },
  "55%": {
    opacity: 1,
    transform: [{ translateX: 40 }, { translateY: -15 }, { rotate: "15deg" }],
  },
  "80%": {
    opacity: 1,
    transform: [{ translateX: 10 }, { translateY: -45 }, { rotate: "-10deg" }],
  },
  "100%": {
    opacity: 1,
    transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "-15deg" }],
  },
};

// A single introductory flight; leaving the screen cancels it, reduced motion is static.
export default function PaperFlight({ style, playKey = "intro" }) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  return (
    <View pointerEvents="none" accessible={false} style={[styles.scene, style]}>
      <View style={styles.trail} />
      <View style={styles.registration}>
        <View style={styles.horizontal} />
        <View style={styles.vertical} />
      </View>
      <Animated.View
        key={playKey}
        style={[
          styles.plane,
          !reduced
            ? {
                animationName: flight,
                animationDuration: 2600,
                animationTimingFunction: cubicBezier(0.45, 0, 0.2, 1),
                animationIterationCount: 1,
                animationFillMode: "both",
                animationPlayState: focused ? "running" : "paused",
              }
            : null,
        ]}
      >
        <Ionicons name="paper-plane-outline" size={42} color={colors.ink} />
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  scene: { width: 120, height: 110 },
  plane: {
    position: "absolute",
    top: 0,
    right: 12,
    transform: [{ rotate: "-15deg" }],
  },
  trail: {
    position: "absolute",
    width: 86,
    height: 68,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.textMuted,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
    borderRadius: 50,
    left: 2,
    top: 32,
    transform: [{ rotate: "-25deg" }],
  },
  registration: {
    position: "absolute",
    bottom: 4,
    left: 8,
    width: 18,
    height: 18,
  },
  horizontal: {
    height: 1,
    width: 18,
    backgroundColor: colors.magenta,
    position: "absolute",
    top: 8,
  },
  vertical: {
    height: 18,
    width: 1,
    backgroundColor: colors.magenta,
    position: "absolute",
    left: 8,
  },
});
