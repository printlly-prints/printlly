import { memo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme";

// The green/teal environment every redesigned screen sits in, so the app
// reads as one continuous place rather than a stack of white pages.
//
// Three layers, back to front:
//   1. a vertical gradient through the four ground tones
//   2. soft blobs - plain Views with a huge borderRadius, which is all a
//      blur-free blob needs and costs nothing
//   3. leaf clusters, top-right and bottom-left
//
// Everything here is decoration: pointerEvents="none" so it can never
// swallow a tap, accessibilityElementsHidden/importantForAccessibility so
// a screen reader never announces it, and overflow:hidden on the root so
// a leaf rotated past the edge cannot widen the screen and introduce
// horizontal scroll.
//
// Opacity is deliberately low. The test for every value below is whether
// body text still reads cleanly on top of it - decoration that competes
// with content is a bug, not a flourish.
//
// DARK THEME: the leaf opacities were raised (roughly 0.08-0.10 -> 0.14-0.18)
// and nothing else about the composition changed. The reason is that the
// contrast direction flipped: on the old pale ground a dark-green leaf at 8%
// was a soft shadow you could just make out, while on a deep green ground the
// same 8% is indistinguishable from the ground itself. The leaves are drawn in
// the UNCHANGED brand `leaf` and `primaryAccent` greens - only how much of
// them shows through moved, which is what keeps the environment perceptible
// without letting it compete with text.
function ScreenBackground({ children, tone = "default" }) {
  const { width } = useWindowDimensions();

  // A screen that is mostly one big white card (payment, OTP) gets a
  // slightly deeper ground so the card still separates from it.
  const gradient =
    tone === "deep"
      ? [colors.backgroundTint, colors.background, colors.leafSoft]
      : [colors.background, colors.backgroundTint, colors.leafSoft];

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />

      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Blobs. Sized off the viewport width so the composition holds
            on a small phone as well as a tablet. */}
        <View style={[styles.blob, styles.blobTop, { width: width * 0.8, height: width * 0.8 }]} />
        <View
          style={[styles.blob, styles.blobBottom, { width: width * 0.9, height: width * 0.9 }]}
        />

        {/* Leaves, drawn with the icon font rather than bundled art:
            no new native dependency, and they scale and tint cleanly. */}
        <View style={styles.leavesTopRight}>
          <Ionicons name="leaf" size={88} color={colors.leaf} style={styles.leafA} />
          <Ionicons name="leaf" size={62} color={colors.primaryAccent} style={styles.leafB} />
          <Ionicons name="leaf" size={44} color={colors.leaf} style={styles.leafC} />
        </View>
        <View style={styles.leavesBottomLeft}>
          <Ionicons name="leaf" size={96} color={colors.leaf} style={styles.leafD} />
          <Ionicons name="leaf" size={64} color={colors.primaryAccent} style={styles.leafE} />
        </View>
      </View>

      {children}
    </View>
  );
}

export default memo(ScreenBackground);

const styles = StyleSheet.create({
  // overflow:hidden is load-bearing: the rotated leaves below extend past
  // the edge, and without it they would widen the layout.
  root: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },

  blob: { position: "absolute", borderRadius: 9999 },
  blobTop: { top: -120, right: -100, backgroundColor: colors.primaryWash, opacity: 0.7 },
  blobBottom: { bottom: -160, left: -140, backgroundColor: colors.leafSoft, opacity: 0.9 },

  leavesTopRight: { position: "absolute", top: -14, right: -26 },
  leafA: { opacity: 0.16, transform: [{ rotate: "24deg" }] },
  leafB: { position: "absolute", top: 46, right: 54, opacity: 0.15, transform: [{ rotate: "-32deg" }] },
  leafC: { position: "absolute", top: 96, right: -4, opacity: 0.14, transform: [{ rotate: "62deg" }] },

  leavesBottomLeft: { position: "absolute", bottom: -20, left: -30 },
  leafD: { opacity: 0.15, transform: [{ rotate: "-138deg" }] },
  leafE: { position: "absolute", bottom: 58, left: 62, opacity: 0.14, transform: [{ rotate: "168deg" }] },
});
