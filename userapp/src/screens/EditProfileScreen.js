import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "react-native-sonner";
import { useAuth } from "../context/AuthContext";
import ProfileAvatar from "../components/ProfileAvatar";
import Button from "../components/Button";
import DocumentSettingsCard from "../components/DocumentSettingsCard";
import { defaultDocumentSettings } from "../utils/documentSettings";
import { HUMAN_AVATARS } from "../utils/profileAvatars";
import { colors, typography, spacing } from "../theme";

export default function EditProfileScreen({ navigation, route }) {
  const { user, appearance, saveAppearance } = useAuth();
  const defaultsOnly = route.name === "PrintDefaults";
  const [name, setName] = useState(appearance?.name || user?.name || "");
  const [avatar, setAvatar] = useState(
    HUMAN_AVATARS.some((item) => item.id === appearance?.avatar)
      ? appearance.avatar
      : "avatar-01",
  );
  const [printDefaults, setPrintDefaults] = useState(
    appearance?.printDefaults || defaultDocumentSettings(),
  );
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveAppearance({
        name,
        avatar,
        printDefaults: { ...printDefaults, services: [] },
      });
      navigation.goBack();
      toast.success(
        defaultsOnly ? "Print preferences saved" : "Profile updated",
      );
    } catch (err) {
      setError(err.message || "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={96}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {defaultsOnly ? (
          <>
            <Text style={styles.note}>
              New documents start with these settings. You can change them for
              each file before ordering.
            </Text>
            <View style={styles.defaults}>
              <DocumentSettingsCard
                compact
                settings={printDefaults}
                onChange={setPrintDefaults}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.avatar}>
              <ProfileAvatar avatar={avatar} size={96} />
            </View>
            <Text style={styles.label}>Choose an avatar</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Profile avatars"
              style={styles.colours}
            >
              {HUMAN_AVATARS.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityLabel={item.label}
                  accessibilityState={{ checked: avatar === item.id }}
                  aria-checked={avatar === item.id}
                  onPress={() => setAvatar(item.id)}
                  disabled={saving}
                  style={[
                    styles.swatchRing,
                    avatar === item.id && styles.selected,
                  ]}
                >
                  <ProfileAvatar avatar={item.id} size={46} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.note}>Appearance is saved on this device.</Text>
            <Text style={[styles.label, { marginTop: spacing.xl }]}>
              Display name
            </Text>
            <TextInput
              accessibilityLabel="Display name"
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoCapitalize="words"
              autoComplete="nickname"
              editable={!saving}
              style={styles.input}
              returnKeyType="done"
            />
            <Text style={styles.note}>
              Personalizes your profile and greeting.
            </Text>
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Email</Text>
            <View style={styles.email}>
              <Text selectable style={styles.note}>
                {user?.email}
              </Text>
            </View>
            <Text style={styles.note}>
              Linked to your sign-in. It can’t be changed here.
            </Text>
          </>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}
      >
        <Button
          title="Save changes"
          loading={saving}
          disabled={!name.trim()}
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: spacing.md, paddingBottom: spacing.xxl },
  avatar: {
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  label: { ...typography.labelSmall, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textSecondary },
  colours: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  swatchRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { borderColor: colors.primary },
  swatch: { width: 38, height: 38, borderRadius: 19 },
  input: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 22,
    minHeight: 54,
  },
  email: {
    backgroundColor: colors.backgroundSoft,
    padding: spacing.lg,
    borderRadius: 20,
  },
  defaults: { marginTop: spacing.lg },
  error: { ...typography.bodySmall, color: colors.danger },
  footer: {
    padding: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
});
