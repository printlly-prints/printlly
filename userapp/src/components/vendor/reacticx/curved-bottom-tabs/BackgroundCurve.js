// Adapted from rit3zh/reacticx src/components/base/curved-bottom-tabs (MIT).
// Source Bezier profile, scaled around a smaller floating circle.
import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors } from "../../../../theme";

export default function BackgroundCurve({ center, width, height }) {
  const total = width * 3,
    middle = width * 1.5,
    scale = (width / 394) * 0.75;
  const path = `M0 12 H${middle - 64 * scale} C${middle - 37.276 * scale} 12 ${middle - 24.316 * scale} 46 ${middle} 46 C${middle + 23.932 * scale} 45.66 ${middle + 38.992 * scale} 12 ${middle + 61 * scale} 12 H${total} V${height} H0 Z`;
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: center.value - width * 1.5 }],
  }));
  return (
    <View pointerEvents="none" style={{ width, overflow: "hidden" }}>
      <Animated.View style={animated}>
        <Svg width={total} height={height}>
          <Path
            d={path}
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth={1}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
