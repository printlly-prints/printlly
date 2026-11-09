import { Image, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "pressto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useReducedMotion } from "react-native-reanimated";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import SupportChatButton from "./SupportChatButton";
import { greetingForHour } from "../utils/greeting";
import { colors, typography, spacing } from "../theme";

export default function AppHeader({ navigation, title, accessory }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { user, appearance } = useAuth();
  const { unreadCount } = useNotifications();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
      <Image
        source={require("../../assets/paprout-mark.png")}
        style={styles.mark}
        resizeMode="contain"
        accessible={false}
      />
      <View style={styles.copy}>
        {!title ? (
          <Text style={styles.greeting}>
            {greetingForHour(new Date().getHours())}
          </Text>
        ) : null}
        <Text style={styles.title}>
          {title || appearance?.name || user?.name || "Hello there"}
        </Text>
      </View>
      {accessory}
      <SupportChatButton navigation={navigation} />
      {!title ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            unreadCount
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          onPress={() => navigation.navigate("Notifications")}
          config={{ minScale: reduced ? 1 : 0.94 }}
          animationConfig={{ duration: reduced ? 1 : 120 }}
          style={styles.bell}
        >
          <Ionicons name="notifications-outline" size={23} color={colors.ink} />
          {unreadCount > 0 ? <View style={styles.dot} /> : null}
        </PressableScale>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: 20,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  copy: { flex: 1, gap: 2 },
  mark: { width: 30, height: 36 },
  title: { ...typography.h2, fontSize: 24, color: colors.ink },
  greeting: { ...typography.caption, color: colors.textSecondary },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.magenta,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
