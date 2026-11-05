import { useEffect, useState } from "react";
import { Keyboard, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { typography, radius } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
const TABS = { Home: { icon: "home-outline", label: "Home" }, Shops: { icon: "storefront-outline", label: "Shops" }, Orders: { icon: "document-text-outline", label: "Orders" }, Profile: { icon: "person-outline", label: "Profile" } };
export default function BottomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets(), { fontScale } = useWindowDimensions(), { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => { const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true)), hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false)); return () => { shown.remove(); hidden.remove(); }; }, []);
  if (keyboardVisible) return null;
  return <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom), minHeight: 76 + insets.bottom }]}>
    {state.routes.map((route, index) => {
      const selected = state.index === index, tab = TABS[route.name], options = descriptors[route.key].options, badge = options.tabBarBadge;
      const press = () => { const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true }); if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params); };
      return <Pressable key={route.key} onPress={press} onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })} accessibilityRole="tab"
        accessibilityState={{ selected }} accessibilityLabel={`${tab.label}${badge ? `, ${badge} unread` : ""}`} style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && { backgroundColor: colors.selection }]}>
        <Ionicons name={tab.icon} size={22} color={selected ? colors.action : colors.textSecondary} />
        <Text style={[styles.label, { color: selected ? colors.action : colors.textSecondary }, fontScale > 1.4 && { fontSize: 12, lineHeight: 18 }]}>{tab.label}</Text>
        {badge ? <View style={styles.dot} /> : null}
      </Pressable>;
    })}
  </View>;
}
const createStyles = ({ colors }) => ({
  bar: { flexDirection: "row", gap: 4, backgroundColor: colors.surface, paddingTop: 10, paddingHorizontal: 8, alignItems: "stretch" },
  tab: { flex: 1, minWidth: 0, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 4, padding: 8, borderRadius: radius.button },
  selected: { backgroundColor: colors.selection }, label: { ...typography.caption, textAlign: "center" }, dot: { position: "absolute", right: 14, top: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
});
export const TAB_BAR_BASE_HEIGHT = 76;
