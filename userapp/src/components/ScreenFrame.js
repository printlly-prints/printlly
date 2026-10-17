import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { typography } from "../theme";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useRoute } from "@react-navigation/native";
// Native safe areas replace Figma status/keyboard placeholders. The footer is
// in normal layout so the final field always remains reachable by scrolling.
export default function ScreenFrame({ title = "Printlly", onBack, accessory, children, footer, contentStyle, scroll = true, hideNavigation = false, refreshControl }) {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  // MainTabs already owns the lower safe area. A full-screen modal uses
  // its own safe area even when opened from a tab root.
  const bottomInset = !hideNavigation && ["Home", "Shops", "Orders", "Profile"].includes(route.name) ? 0 : insets.bottom;
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const content = scroll ? <ScrollView style={styles.flex} refreshControl={refreshControl} contentContainerStyle={[styles.content, contentStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>{children}</ScrollView> : <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>;
  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <View style={styles.header}>
      {onBack ? <Pressable onPress={onBack} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={22} color={colors.textPrimary} /></Pressable> : null}
      <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>{accessory}
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 56}>
      {content}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(16, bottomInset) }]}><View style={styles.footerContent}>{footer}</View></View> : <View style={{ height: bottomInset }} />}
    </KeyboardAvoidingView>
  </View>;
}
const createStyles = ({ colors }) => ({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 24, width: "100%", maxWidth: 608, alignSelf: "center" },
  headerTitle: { ...typography.h3, color: colors.textPrimary, flex: 1, paddingVertical: 12 }, iconButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  content: { flexGrow: 1, padding: 24, width: "100%", maxWidth: 608, alignSelf: "center" }, footer: { backgroundColor: colors.surface, paddingTop: 16, paddingHorizontal: 24 }, footerContent: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 8 },
});
