import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, typography } from "../theme";

const HOLE_PADDING = 8;
const ARROW_SIZE = 52;

// First-run tour over the real Home screen. `steps` carries each target's
// on-screen rect, measured by Home just before opening this.
export default function CoachMarksScreen({ route, navigation }) {
  const { steps } = route.params;
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState(null);
  const root = useRef(null);
  const reduced = useReducedMotion();
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (!reduced)
      bounce.value = withRepeat(withTiming(10, { duration: 450 }), -1, true);
  }, [reduced, bounce]);

  // Targets were measured in window coordinates, so make them relative to
  // this overlay, whose origin differs on Android.
  const step = size
    ? {
        ...steps[index],
        x: steps[index].x - size.x,
        y: steps[index].y - size.y,
      }
    : steps[index];
  const last = index === steps.length - 1;
  const next = () =>
    last ? navigation.goBack() : setIndex((value) => value + 1);

  const hole = {
    x: step.x - HOLE_PADDING,
    y: step.y - HOLE_PADDING,
    width: step.width + HOLE_PADDING * 2,
    height: step.height + HOLE_PADDING * 2,
  };
  const pointsUp = size && step.y + step.height / 2 < size.height / 2;
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pointsUp ? bounce.value : -bounce.value }],
  }));

  return (
    <View
      ref={root}
      collapsable={false}
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
      onLayout={({ nativeEvent: { layout } }) =>
        root.current?.measureInWindow((x, y) =>
          setSize({ width: layout.width, height: layout.height, x, y }),
        )
      }
    >
      {size ? (
        <>
          <Svg
            width={size.width}
            height={size.height}
            style={StyleSheet.absoluteFill}
          >
            <Defs>
              <Mask id="spotlight">
                <Rect width={size.width} height={size.height} fill="white" />
                <Rect {...hole} rx={16} fill="black" />
              </Mask>
            </Defs>
            <Rect
              width={size.width}
              height={size.height}
              fill={colors.ink}
              fillOpacity={0.78}
              mask="url(#spotlight)"
            />
            <Rect
              {...hole}
              rx={16}
              fill="none"
              stroke={colors.surface}
              strokeWidth={2}
            />
          </Svg>

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. ${step.body}. ${last ? "Finish" : "Next"}`}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.arrow,
              arrowStyle,
              {
                left: Math.min(
                  Math.max(
                    step.x + step.width / 2 - ARROW_SIZE / 2,
                    spacing.lg,
                  ),
                  size.width - ARROW_SIZE - spacing.lg,
                ),
                top: pointsUp
                  ? hole.y + hole.height + spacing.xs
                  : hole.y - ARROW_SIZE - spacing.xs,
              },
            ]}
          >
            <Ionicons
              name={pointsUp ? "arrow-up" : "arrow-down"}
              size={ARROW_SIZE}
              color={colors.surface}
            />
          </Animated.View>

          <View
            pointerEvents="none"
            style={[
              styles.bubble,
              pointsUp
                ? { top: hole.y + hole.height + ARROW_SIZE + spacing.lg }
                : {
                    bottom: size.height - hole.y + ARROW_SIZE + spacing.lg,
                  },
            ]}
          >
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <Text style={styles.next}>
              {last ? "Got it" : `Next · ${index + 1}/${steps.length}`}
            </Text>
          </View>

          {!last ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
              style={styles.skip}
            >
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: { position: "absolute" },
  bubble: {
    position: "absolute",
    left: 20,
    right: 20,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  title: { ...typography.h3, color: colors.ink },
  body: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  next: {
    ...typography.label,
    color: colors.primary,
    marginTop: spacing.md,
    textAlign: "right",
  },
  skip: {
    position: "absolute",
    bottom: spacing.xl,
    alignSelf: "center",
    minHeight: 44,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { ...typography.label, color: colors.onPrimary },
});
