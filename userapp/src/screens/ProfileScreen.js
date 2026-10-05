import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Avatar from "../components/Avatar";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { useSupport } from "../context/SupportContext";
import { colors, typography, spacing, radius } from "../theme";

const stub = (feature) => () => Alert.alert(feature, "This isn't available yet.");

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  // Unread admin replies, kept live by the support socket (see
  // SupportContext) rather than polled - a reply that arrives while the
  // customer is on another screen lights this dot straight away.
  const { unreadCount } = useSupport() || {};

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Avatar name={user?.name} size={72} />
        <Text style={styles.name}>{user?.name || "Customer"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {/* No PATCH endpoint exists yet for editing a customer's profile -
            this is a stub, not a fake success. */}
        <Button title="Edit Profile" variant="secondary" onPress={stub("Edit Profile")} />
      </View>

      {/* Grouped rather than one long list: the old menu put "Help &
          Support" between Notifications and Settings, where a customer
          with a problem had to read past unrelated rows to find it. */}
      <Section title="Account">
        <MenuItem icon="person-outline" label="My Profile" onPress={stub("My Profile")} />
        <MenuItem
          icon="receipt-outline"
          label="Order History"
          onPress={() => navigation.navigate("MainTabs", { screen: "Orders" })}
        />
        <MenuItem
          icon="heart-outline"
          label="Saved Shops"
          onPress={() => navigation.navigate("SavedShops")}
        />
        <MenuItem
          icon="notifications-outline"
          label="Notifications"
          onPress={() => navigation.navigate("Notifications")}
          last
        />
      </Section>

      <Section title="Support">
        <MenuItem
          icon="help-circle-outline"
          label="Help & Support"
          badge={unreadCount}
          onPress={() => navigation.navigate("HelpSupport")}
          last
        />
      </Section>

      <Section title="App">
        <MenuItem
          icon="settings-outline"
          label="Settings"
          onPress={() => navigation.navigate("Settings")}
        />
        {/* Privacy routes into Settings too - that's where the one real
            privacy-relevant fact (document handling) actually lives. */}
        <MenuItem
          icon="shield-checkmark-outline"
          label="Privacy"
          onPress={() => navigation.navigate("Settings")}
          last
        />
      </Section>

      {/* Its own group with nothing else in it, so Logout can't be hit
          while aiming for the row above. */}
      <Section>
        <MenuItem icon="log-out-outline" label="Logout" onPress={logout} destructive last />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.menu}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, onPress, destructive, last, badge }) {
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Pressable style={[styles.menuItem, !last && styles.menuItemBorder]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textSecondary} />
      <Text style={[styles.menuLabel, destructive && styles.menuLabelDestructive]}>{label}</Text>
      {/* A count, not a bare dot: "3 replies waiting" is a different
          decision from "1 reply waiting". Capped so a long-neglected
          thread can't stretch the row. */}
      {showBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
      {!destructive && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  identity: { alignItems: "center", paddingVertical: spacing.xl },
  name: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.md },
  email: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },

  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuLabel: { ...typography.bodyMedium, color: colors.textPrimary, flex: 1 },
  menuLabelDestructive: { color: colors.danger },

  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { ...typography.caption, color: colors.surface, lineHeight: 16 },
});
