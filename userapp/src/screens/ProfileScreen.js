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
import { defaultDocumentSettings } from "../utils/documentSettings";
import {
  profileAccent,
  suggestedAvatar,
  PROFILE_WASH,
} from "../utils/profilePreferences";
import { colors, typography, spacing } from "../theme";

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
        <ProfileAvatar
          avatar={appearance?.avatar || suggestedAvatar(user?.gender)}
          name={name}
          colour={accent}
          size={64}
        />
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
          <Ionicons name="pencil-outline" size={21} color={colors.ink} />
        </Pressable>
      </View>
      <Text style={styles.section}>Default print settings</Text>
      <View style={styles.card}>
        <View style={styles.defaults}>
          <Setting
            label="Colour"
            value={print.color_mode === "bw" ? "Black & white" : "Colour"}
          />
          <Setting label="Paper" value={print.paper_size} />
          <Setting
            label="Sides"
            value={print.sides === "double" ? "Double-sided" : "Single-sided"}
          />
          <Setting label="Copies" value={String(print.copies)} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("PrintDefaults")}
          style={styles.editDefaults}
        >
          <Text style={styles.link}>Edit defaults</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>App</Text>
      <View style={[styles.card, { paddingVertical: 0 }]}>
        <MenuItem
          icon="shield-checkmark-outline"
          label="Privacy & app settings"
          onPress={() => navigation.navigate("Settings")}
        />
        <MenuItem
          icon="help-circle-outline"
          label="Help and support"
          badge={unreadCount}
          onPress={() => navigation.navigate("HelpSupport")}
          last
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        onPress={signOut}
        style={styles.logout}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}
function Setting({ label, value }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}
function MenuItem({ icon, label, badge, onPress, last }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label + (badge > 0 ? `, ${badge} unread` : "")}
      onPress={onPress}
      style={[styles.menuItem, !last && styles.rowBorder]}
    >
      <Ionicons name={icon} size={21} color={colors.textSecondary} />
      <Text style={styles.menuLabel}>{label}</Text>
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
  edit: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 24,
  },
  defaults: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
  setting: { width: "50%", gap: spacing.xs },
  settingLabel: { ...typography.caption, color: colors.textSecondary },
  settingValue: { ...typography.labelSmall, color: colors.ink },
  editDefaults: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: spacing.md,
  },
  link: { ...typography.labelSmall, color: colors.primaryDeep },
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
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  logoutText: { ...typography.label, color: colors.danger },
});
