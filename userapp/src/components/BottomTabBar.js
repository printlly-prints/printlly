import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import BackgroundCurve from "./vendor/reacticx/curved-bottom-tabs/BackgroundCurve";
import { colors, fonts } from "../theme";

const BASE_HEIGHT = 86;
const TABS = {
  Home: { icon: "print", label: "Print" },
  Shops: { icon: "storefront", label: "Shops" },
  Orders: { icon: "receipt", label: "Orders" },
  Profile: { icon: "person", label: "You" },
};
function TabIcon({ focused, icon, reduced }) {
  const lift = useSharedValue(focused ? -18 : 0);
  useEffect(() => {
    const target = focused ? -18 : 0;
    lift.value = reduced
      ? target
      : withSpring(target, {
          damping: 10,
          stiffness: 100,
          mass: 0.5,
        });
  }, [focused, reduced, lift]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }],
  }));
  return (
    <Animated.View
      style={[styles.iconCircle, focused && styles.activeCircle, animated]}
    >
      <Ionicons
        name={icon + (focused ? "" : "-outline")}
        size={23}
        color={focused ? colors.onPrimary : colors.textMuted}
      />
    </Animated.View>
  );
}
// Reacticx Curved Bottom Tabs geometry and spring, driven by React Navigation's route state.
export default function BottomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets(),
    reduced = useReducedMotion();
  const [width, setWidth] = useState(0),
    placed = useRef(false),
    center = useSharedValue(0);
  useEffect(() => {
    if (!width) return;
    const target = ((state.index + 0.5) * width) / state.routes.length;
    center.value =
      !placed.current || reduced
        ? target
        : withSpring(target, { damping: 12, stiffness: 120, mass: 0.5 });
    placed.current = true;
  }, [state.index, state.routes.length, width, reduced, center]);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.bar, { height: BASE_HEIGHT + insets.bottom }]}
    >
      {width > 0 ? (
        <View style={styles.background}>
          <BackgroundCurve
            center={center}
            width={width}
            height={BASE_HEIGHT + insets.bottom}
          />
        </View>
      ) : null}
      <View style={[styles.row, { bottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const focused = index === state.index,
            tab = TABS[route.name] || { icon: "ellipse", label: route.name },
            options = descriptors[route.key].options;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel || tab.label}
              accessibilityState={{ selected: focused }}
              aria-selected={focused}
              style={styles.tab}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!event.defaultPrevented && !focused)
                  navigation.navigate(route.name, route.params);
              }}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
            >
              <TabIcon focused={focused} icon={tab.icon} reduced={reduced} />
              <Text style={[styles.label, focused && styles.selectedLabel]}>
                {tab.label}
              </Text>
              {options.tabBarBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {options.tabBarBadge > 9 ? "9+" : options.tabBarBadge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  bar: { backgroundColor: colors.background, position: "relative" },
  background: { position: "absolute", left: 0, right: 0, top: 0 },
  row: {
    zIndex: 1,
    position: "absolute",
    left: 0,
    right: 0,
    top: 14,
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 9,
    gap: 5,
    minHeight: 64,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  selectedLabel: {
    fontFamily: fonts.headingSemiBold,
    color: colors.primaryDeep,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  activeCircle: { backgroundColor: colors.primary },
  badge: {
    position: "absolute",
    right: 16,
    top: 20,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.magenta,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 9,
    color: colors.onPrimary,
  },
});
export { BASE_HEIGHT as TAB_BAR_BASE_HEIGHT };
