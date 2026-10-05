import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, fonts, radius, shadows } from "../theme";

// The customer app's bottom navigation, replacing the stock bottom-tabs
// bar.
//
// Why a custom bar at all: the stock one was given a label style carrying
// typography.caption, which is 12.5px text on an 18px line box. The
// default bar sizes itself for a much tighter label, so icon + label came
// to more than the row it was allowed and the labels clipped at the
// bottom edge - worse on devices with a home indicator, where the safe
// area inset eats into the same row.
//
// The layout rules this bar holds to, all of which the stock one made
// hard to guarantee:
//   - every tab is flex: 1, so four tabs always divide the viewport
//     exactly, at any width, with no fixed pixel widths anywhere
//   - the row is the full width of its parent and never scrolls, so
//     nothing can overflow horizontally
//   - height is BASE_HEIGHT + the device's bottom inset, and the inset
//     is applied as padding, so the touch targets sit above the home
//     indicator rather than under it
//   - the label is one line, centred, and given its own line height, so
//     it cannot be clipped by the row
//
// This bar is NOT absolutely positioned. React Navigation lays it out
// below the screen content and insets the content area by exactly the
// height reported here, which is what guarantees the last card on any
// tab is reachable. A floating bar would put that guarantee back in the
// hands of every screen remembering its own bottom padding.
const BASE_HEIGHT = 58;

const TABS = {
  Home: { icon: "home", label: "Home" },
  Shops: { icon: "storefront", label: "Print Shops" },
  Orders: { icon: "receipt", label: "My Orders" },
  Profile: { icon: "person", label: "Profile" },
};

export default function BottomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { height: BASE_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const tab = TABS[route.name] || { icon: "ellipse", label: route.name };
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          // navigate() rather than a raw jumpTo so a tab that is already
          // focused pops its own stack, which is what a second tap on the
          // current tab is expected to do.
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() =>
              navigation.emit({ type: "tabLongPress", target: route.key })
            }
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel || tab.label}
            // flex: 1 is the whole point - four of these always add up to
            // the viewport width exactly, at 320px and at 430px alike.
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={`${tab.icon}${focused ? "" : "-outline"}`}
                size={21}
                color={focused ? colors.primaryBright : colors.textMuted}
              />
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {badge > 9 ? "9+" : badge}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* One line, ellipsised rather than wrapped: "Print Shops" at
                320px must shrink its box, never grow the row. */}
            <Text
              numberOfLines={1}
              style={[styles.label, focused && styles.labelActive]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.sheet,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  tabPressed: { opacity: 0.6 },
  iconWrap: {
    minWidth: 46,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  // The active pill sits behind the icon only, not the label, so it stays
  // the same size whatever the label's length.
  iconWrapActive: { backgroundColor: colors.primaryWash },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: "center",
  },
  labelActive: { fontFamily: fonts.headingBold, color: colors.primaryBright },
  badge: {
    position: "absolute",
    top: -2,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: fonts.headingBold,
    fontSize: 9.5,
    lineHeight: 12,
    color: colors.surface,
  },
});

export { BASE_HEIGHT as TAB_BAR_BASE_HEIGHT };
