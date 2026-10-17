import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import FormField from "../components/FormField";
import Avatar from "../components/Avatar";
import AvatarPicker from "../components/AvatarPicker";
import Button from "../components/Button";
import ProfileDetailsFields from "../components/ProfileDetailsFields";
import { profileDetailsError } from "../utils/profileDetails";
import { DEFAULT_AVATAR_ID } from "../constants/avatarIds";
import { useAuth } from "../context/AuthContext";
import { useAvatar } from "../context/AvatarContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { toDemoCredentials } from "../constants/demoAuth";
import { typography, radius } from "../theme";

export default function AccountSetupScreen({ route, navigation }) {
  const { phone } = route.params, { register } = useAuth(), { saveAvatar } = useAvatar(), { colors } = useTheme();
  const styles = useThemedStyles(createStyles), submitting = useRef(false);
  const [name, setName] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID), [pickerOpen, setPickerOpen] = useState(false);
  const [details, setDetails] = useState({ dob: "", contactEmail: "" });
  const submit = async () => {
    if (submitting.current) return;
    if (!name.trim()) { setError("Enter your name to continue."); return; }
    const detailsError = profileDetailsError(details);
    if (detailsError) { setError(detailsError); return; }
    submitting.current = true; setError(""); setLoading(true);
    try {
      const { email, password } = toDemoCredentials(phone);
      const newUser = await register({ name: name.trim(), phone, email, password, contact_email: details.contactEmail.trim(), date_of_birth: details.dob || undefined });
      await saveAvatar(avatarId, newUser.id);
    } catch (err) { setError(err.response?.data?.message || err.message || "Could not create your account. Try again."); }
    finally { submitting.current = false; setLoading(false); }
  };
  return <>
    <ScreenFrame title="Your details" onBack={() => navigation.goBack()} footer={<Button title="Continue" loading={loading} onPress={submit} />}>
      <View style={styles.introduction}>
        <Avatar avatarId={avatarId} size={88} decorative />
        <View style={{ flex: 1 }}><Text style={styles.title}>Let’s get to know you</Text><Text style={styles.body}>Add your name and choose an avatar.</Text></View>
      </View>
      <View style={styles.fields}>
        <FormField label="Your name" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" autoCapitalize="words" error={error} returnKeyType="done" onSubmitEditing={submit} />
        <ProfileDetailsFields value={details} onChange={setDetails} disabled={loading} />
      </View>
      <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" style={styles.avatarRow}>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Choose avatar</Text><Text style={styles.rowNote}>Pick one that feels like you</Text></View>
        <Ionicons name="chevron-forward" size={22} color={colors.textSecondary} />
      </Pressable>
      <Text style={styles.localNote}>Your avatar is saved on this device.</Text>
    </ScreenFrame>
    <AvatarPicker visible={pickerOpen} initialId={avatarId} onClose={() => setPickerOpen(false)} onConfirm={(id) => { setAvatarId(id); setPickerOpen(false); }} />
  </>;
}
const createStyles = ({ colors }) => ({
  introduction: { flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 24 }, title: { ...typography.h3, color: colors.textPrimary }, body: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 }, fields: { gap: 20 },
  avatarRow: { minHeight: 72, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 }, rowTitle: { ...typography.bodyMedium, color: colors.textPrimary }, rowNote: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, localNote: { ...typography.caption, color: colors.textSecondary, marginTop: 16 },
});
