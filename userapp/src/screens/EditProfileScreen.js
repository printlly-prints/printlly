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
import GenderOptions from "../components/GenderOptions";
import { suggestedAvatar, profileAccent } from "../utils/profilePreferences";

export default function EditProfileScreen({ navigation, route }) {
  const { user, appearance, saveAppearance } = useAuth();
  const defaultsOnly = route.name === "PrintDefaults";
  const [gender, setGender] = useState(
    appearance?.gender || user?.gender || "prefer_not_to_say",
  );
  const [colour, setColour] = useState(appearance?.colour || "auto");
  const [avatarChosen, setAvatarChosen] = useState(
    HUMAN_AVATARS.some((item) => item.id === appearance?.avatar),
  );
  const [name, setName] = useState(appearance?.name || user?.name || "");
  const [avatar, setAvatar] = useState(
    HUMAN_AVATARS.some((item) => item.id === appearance?.avatar)
      ? appearance.avatar
      : suggestedAvatar(appearance?.gender || user?.gender),
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
      await saveAppearance(
        {
          name,
          avatar,
          gender,
          colour,
          printDefaults: { ...printDefaults, services: [] },
        },
        { updateBasics: !defaultsOnly },
      );
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
              <ProfileAvatar
                avatar={avatar}
                colour={profileAccent({ gender, colour })}
                size={96}
              />
            </View>
            <Text style={styles.label}>Gender (optional)</Text>
            <GenderOptions
              value={gender}
              disabled={saving}
              onChange={(next) => {
                setGender(next);
                if (!avatarChosen) setAvatar(suggestedAvatar(next));
              }}
            />
            <Text style={styles.label}>Profile accent</Text>
            <View style={styles.colours}>
              {[
                ["auto", "Suggested"],
                ["cyan", "Cyan"],
                ["magenta", "Pink"],
                ["yellow", "Yellow"],
              ].map(([value, label]) => (
                <Pressable
                  key={value}
                  disabled={saving}
                  accessibilityRole="radio"
                  accessibilityLabel={label + " profile accent"}
                  accessibilityState={{ checked: colour === value }}
                  onPress={() => setColour(value)}
                  style={[
                    styles.accentOption,
                    colour === value && styles.selected,
                  ]}
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor:
                        value === "auto"
                          ? colors.primary
                          : value === "cyan"
                            ? colors.primary
                            : value === "magenta"
                              ? colors.magenta
                              : colors.yellow,
                    }}
                  />
                  <Text style={styles.note}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Choose an avatar</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Profile avatars"
              style={styles.colours}
            >
              {[...HUMAN_AVATARS]
                .sort(
                  (a, b) =>
                    Number(b.gender === gender) - Number(a.gender === gender),
                )
                .map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={item.label}
                    accessibilityState={{ checked: avatar === item.id }}
                    aria-checked={avatar === item.id}
                    onPress={() => {
                      setAvatar(item.id);
                      setAvatarChosen(true);
                    }}
                    disabled={saving}
                    style={[
                      styles.swatchRing,
                      avatar === item.id && styles.selected,
                    ]}
                  >
                    <ProfileAvatar
                      avatar={item.id}
                      colour={profileAccent({ gender, colour })}
                      size={60}
                    />
                  </Pressable>
                ))}
            </View>
            <Text style={styles.note}>
              Your gender is optional. All avatars and accents are available to
              everyone. Avatar and accent choices are saved on this device.
            </Text>
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
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { borderColor: colors.primary },
  accentOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
