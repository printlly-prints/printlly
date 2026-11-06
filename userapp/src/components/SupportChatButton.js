import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "pressto";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useReducedMotion } from "react-native-reanimated";
import { useSupport } from "../context/SupportContext";
import { colors, typography } from "../theme";

export default function SupportChatButton({ navigation }) {
  const { unreadCount } = useSupport();
  const reduced = useReducedMotion();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount
          ? `Support chat, ${unreadCount} unread`
          : "Chat with Paprout support"
      }
      onPress={() => navigation.navigate("Chat")}
      config={{ minScale: reduced ? 1 : 0.94 }}
      animationConfig={{ duration: reduced ? 1 : 120 }}
      style={styles.button}
    >
      <Ionicons name="headset-outline" size={23} color={colors.primaryDeep} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.count}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.magenta,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    ...typography.caption,
    fontSize: 9,
    lineHeight: 13,
    color: colors.onPrimary,
  },
});
