import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { toast } from "react-native-sonner";
import { useAuth } from "../context/AuthContext";
import { useSupport } from "../context/SupportContext";
import ProfileAvatar from "../components/ProfileAvatar";
import {
  defaultDocumentSettings,
  describeDocumentSettings,
} from "../utils/documentSettings";
import {
  profileAccent,
  suggestedAvatar,
  PROFILE_WASH,
} from "../utils/profilePreferences";
import { colors, typography, spacing, radius } from "../theme";

export default function ProfileScreen({ navigation }) {
  const { user, logout, appearance } = useAuth();
  const { unreadCount } = useSupport() || {};
  const print = appearance?.printDefaults || defaultDocumentSettings();
  const name = appearance?.name || user?.name || "Customer";
  const accent = profileAccent({
    ...appearance,
    gender: appearance?.gender || user?.gender,
  });
  const wash = colors[PROFILE_WASH[accent]];
  const leave = async () => {
    try {
      await logout();
    } catch {
      toast.error("Couldn't log out. Please try again.");
    }
  };
  const signOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Log out of Paprout?")) leave();
      return;
    }
    Alert.alert("Log out?", "You can sign back in anytime.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: leave },
    ]);
  };
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.identity, { backgroundColor: wash }]}>
        <View style={styles.avatarRing}>
          <ProfileAvatar
            avatar={appearance?.avatar || suggestedAvatar(user?.gender)}
            name={name}
            colour={accent}
            size={60}
          />
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          onPress={() => navigation.navigate("EditProfile")}
          style={styles.edit}
        >
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>
      <View style={styles.group}>
        <View style={styles.groupInner}>
          <MenuItem
            icon="print-outline"
            tint="backgroundSoft"
            label="Print defaults"
            value={describeDocumentSettings({ ...print, services: [] })}
            hint="Edit default print settings"
            onPress={() => navigation.navigate("PrintDefaults")}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            tint="backgroundSoft"
            label="Privacy & app settings"
            onPress={() => navigation.navigate("Settings")}
          />
          <MenuItem
            icon="help-circle-outline"
            tint="backgroundSoft"
            label="Help and support"
            badge={unreadCount}
            onPress={() => navigation.navigate("HelpSupport")}
            last
          />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        onPress={signOut}
        style={styles.logout}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}
function MenuItem({ icon, tint, label, value, badge, hint, onPress, last }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        label +
        (value ? `, ${value}` : "") +
        (badge > 0 ? `, ${badge} unread` : "")
      }
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.menuItem, !last && styles.rowBorder]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors[tint] }]}>
        <Ionicons name={icon} size={19} color={colors.ink} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {value ? (
        <Text style={styles.menuValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {badge > 0 ? <Text style={styles.unread}>{badge}</Text> : null}
      <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.pinkWash,
    borderRadius: 28,
    padding: spacing.lg,
  },
  identityCopy: { flex: 1, gap: spacing.xs },
  name: { ...typography.h3, fontSize: 18, color: colors.ink },
  email: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  // A line and a paper gap keep the avatar from melting into the tinted card.
  avatarRing: {
    padding: 3,
    borderRadius: 36,
    borderWidth: 2,
 borderColor: colors.primary,
 backgroundColor: colors.surface,
  },
  edit: {
    minWidth: 64,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  editText: { ...typography.label, color: colors.primaryDeep },
  group: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    borderRadius: 28,
    backgroundColor: colors.backgroundSoft,
  },
  groupInner: {
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuValue: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
    maxWidth: "45%",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  menuLabel: { ...typography.bodySmall, color: colors.ink, flex: 1 },
  rowBorder: { borderBottomWidth: 1, borderColor: colors.border },
  unread: { ...typography.labelSmall, color: colors.primary },
  logout: {
    minHeight: 52,
    borderRadius: radius.button,
    backgroundColor: colors.backgroundSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  logoutText: { ...typography.label, color: colors.danger },
});
