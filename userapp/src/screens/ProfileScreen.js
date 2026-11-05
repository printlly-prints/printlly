import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Avatar from "../components/Avatar";
import AvatarPicker from "../components/AvatarPicker";
import Button from "../components/Button";
import ProfileDetailsFields from "../components/ProfileDetailsFields";
import { profileDetailsError } from "../utils/profileDetails";
import ScreenFrame from "../components/ScreenFrame";
import { useAuth } from "../context/AuthContext";
import { useAvatar } from "../context/AvatarContext";
import { useSupport } from "../context/SupportContext";
import { useNotifications } from "../context/NotificationsContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography, radius } from "../theme";

// Contact details persist through the profile API. Avatars remain device preferences.
export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshProfile, updateProfile } = useAuth();
  const { avatarId, saveAvatar } = useAvatar();
  const { unreadCount: supportUnread = 0 } = useSupport() || {};
  const { unreadCount = 0 } = useNotifications();
  const { reducedMotion } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState({ dob: "", contactEmail: "" });
  const [detailsLoading, setDetailsLoading] = useState(false), [detailsError, setDetailsError] = useState("");
  const current = useRef({ mounted: true, id: user?.id });
  const profileLoaded = useRef(false);
  current.current.id = user?.id;
  useEffect(() => { current.current.mounted = true; return () => { current.current.mounted = false; }; }, []);
  const openDetails = async () => {
    const account = user?.id;
    profileLoaded.current = false;
    setDetails({ dob: user?.date_of_birth || "", contactEmail: user?.contact_email || "" });
    setDetailsError(""); setDetailsOpen(true); setDetailsLoading(true);
    try { profileLoaded.current = await refreshProfile(); }
    catch { if (current.current.mounted && current.current.id === account) setDetailsError("Could not refresh your profile. Close and reopen to retry."); }
    finally { if (current.current.mounted && current.current.id === account) setDetailsLoading(false); }
  };
  useEffect(() => { if (detailsOpen) setDetails({ dob: user?.date_of_birth || "", contactEmail: user?.contact_email || "" }); }, [user?.contact_email, user?.date_of_birth]);
  const saveDetails = async () => {
    if (detailsLoading) return;
    if (!profileLoaded.current) { setDetailsError("Refresh your profile before saving. Close and reopen to retry."); return; }
    const error = profileDetailsError(details);
    if (error) { setDetailsError(error); return; }
    const account = user?.id;
    setDetailsLoading(true); setDetailsError("");
    try {
      await updateProfile({ contact_email: details.contactEmail.trim() || null, date_of_birth: details.dob || null });
      if (current.current.mounted && current.current.id === account) { setDetailsOpen(false); setMessage("Profile details saved to your account."); }
    } catch (error) { if (current.current.mounted && current.current.id === account) setDetailsError(error.response?.data?.message || error.message || "Could not save your profile. Try again."); }
    finally { if (current.current.mounted && current.current.id === account) setDetailsLoading(false); }
  };
  const signOut = () => Alert.alert("Sign out?", "You can sign in again to see your orders.", [
    { text: "Stay signed in", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: logout },
  ]);
  const chooseAvatar = async (id) => {
    const saved = await saveAvatar(id);
    setPickerOpen(false);
    setMessage(saved ? "Avatar saved on this device." : "Avatar changed for this session. It could not be saved on this device.");
  };
  return <>
    <ScreenFrame title="Your profile">
      <View style={styles.identity}>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="Choose your avatar" style={styles.avatarButton}>
          <Avatar name={user?.name} size={80} decorative />
        </Pressable>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{user?.name || "Customer"}</Text>
          {user?.phone ? <Text style={styles.detail}>{user.phone}</Text> : null}
          <Text style={styles.localNote}>Your Printlly account</Text>
        </View>
      </View>
      <View style={styles.rows}>
        <AccountRow title="Account details" detail="Your contact email and date of birth" onPress={openDetails} />
        <AccountRow title="Saved shops" detail="Your favourite print shops" onPress={() => navigation.navigate("SavedShops")} />
        <AccountRow title="Notifications" detail={unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "Order and payment updates"} onPress={() => navigation.navigate("Notifications")} badge={unreadCount} />
        <AccountRow title="Settings" detail="Appearance, location and preferences" onPress={() => navigation.navigate("Settings")} />
        <AccountRow title="Help & support" detail={supportUnread > 0 ? `${supportUnread} new repl${supportUnread === 1 ? "y" : "ies"}` : "We’re here to help"} onPress={() => navigation.navigate("HelpSupport")} badge={supportUnread} />
      </View>
      {message ? <Text style={styles.feedback} accessibilityLiveRegion="polite">{message}</Text> : null}
      <Button title="Sign out" variant="secondary" onPress={signOut} style={styles.signOut} />
    </ScreenFrame>
    {pickerOpen ? <AvatarPicker visible initialId={avatarId} onClose={() => setPickerOpen(false)} onConfirm={chooseAvatar} /> : null}
    <Modal visible={detailsOpen} animationType={reducedMotion ? "none" : "fade"} onRequestClose={() => setDetailsOpen(false)} presentationStyle="fullScreen">
      <ScreenFrame hideNavigation title="Account details" onBack={() => setDetailsOpen(false)} footer={<Button title="Save details" loading={detailsLoading} onPress={saveDetails} />}>
        <View style={styles.detailsCard}>
          <Detail label="Name" value={user?.name || "Not provided"} />
          <Detail label="Phone" value={user?.phone || "Not provided"} />
          <Detail label="Sign-in email" value={user?.email || "Not provided"} />
          <ProfileDetailsFields value={details} onChange={setDetails} disabled={detailsLoading} />
          {detailsError ? <Text style={styles.detail} accessibilityLiveRegion="polite">{detailsError}</Text> : null}
        </View>
      </ScreenFrame>
    </Modal>
  </>;
}
function Detail({ label, value }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.detailGroup}><Text style={styles.localNote}>{label}</Text><Text style={styles.name} selectable>{value}</Text></View>;
}
// Shared account/support row matching the V2 72px menu component.
export function AccountRow({ title, detail, onPress, badge, disabled = false, accessory, expanded }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const Component = onPress ? Pressable : View;
  return <Component onPress={onPress} disabled={disabled} accessibilityRole={onPress ? "button" : undefined}
    accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
    style={onPress ? ({ pressed }) => [styles.row, pressed && !disabled && { backgroundColor: colors.selection }] : styles.row}>
    <View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text>{detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}</View>
    {badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text></View> : null}
    {accessory || (onPress && !disabled ? <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /> : null)}
  </Component>;
}
const createStyles = ({ colors }) => ({
  identity: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 16, marginBottom: 20 },
  avatarButton: { minWidth: 80, minHeight: 80, alignItems: "center", justifyContent: "center" }, identityCopy: { flex: 1 },
  name: { ...typography.h3, color: colors.textPrimary, flexShrink: 1 }, detail: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
  localNote: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, rows: { gap: 20 },
  row: { minHeight: 72, padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: 12 },
  rowCopy: { flex: 1 }, rowTitle: { ...typography.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textPrimary }, rowDetail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  badge: { minWidth: 24, minHeight: 24, borderRadius: 12, backgroundColor: colors.action, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { ...typography.caption, color: colors.onAction }, feedback: { ...typography.caption, color: colors.textSecondary, marginTop: 16 }, signOut: { marginTop: 20 },
  detailsCard: { padding: 16, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: 20, gap: 16 }, detailGroup: { gap: 2 },
});
