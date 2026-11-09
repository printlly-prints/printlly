import Animated, { useReducedMotion } from "react-native-reanimated";
import { colors, radius } from "../theme";

export default function Skeleton({ height = 18, width = "100%" }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      accessible={false}
      style={[styles.block, { height, width }, !reduced && styles.pulse]}
    />
  );
}
const styles = {
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
  pulse: {
    animationName: { from: { opacity: 0.4 }, to: { opacity: 0.9 } },
    animationDuration: 800,
    animationIterationCount: "infinite",
    animationDirection: "alternate",
    animationTimingFunction: "linear",
  },
};
