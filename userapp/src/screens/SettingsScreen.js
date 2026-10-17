import { useState } from "react";
import { Alert, Linking, Pressable, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import { AccountRow } from "./ProfileScreen";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "../context/LocationContext";
import { useOpeningPreferences } from "../context/OpeningPreferencesContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography, radius } from "../theme";
const appearanceLabels = { system: "Use device setting", light: "Light", dark: "Dark" };
export default function SettingsScreen({ navigation }) {
  const { preference, setAppearance, error: appearanceError, reducedMotion, colors } = useTheme();
  const { status: locationStatus } = useLocation();
  const { logout } = useAuth();
  const { enabled: openingEnabled, ready: openingReady, setEnabled: setOpeningEnabled, error: openingError } = useOpeningPreferences();
  const styles = useThemedStyles(createStyles);
  const [section, setSection] = useState(null), [error, setError] = useState("");
  const toggle = (name) => setSection((current) => current === name ? null : name);
  const deviceSettings = async () => {
    try { await Linking.openSettings(); setError(""); }
    catch { setError("Could not open device settings."); }
  };
  const signOut = () => Alert.alert("Sign out?", "You can sign in again to see your orders.", [
    { text: "Stay signed in", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: logout },
  ]);
  return <ScreenFrame title="Settings" onBack={() => navigation.goBack()}>
    <View style={styles.rows}>
      <AccountRow title="Appearance" detail={appearanceLabels[preference]} onPress={() => toggle("appearance")} />
      {section === "appearance" ? <View style={styles.panel} accessibilityRole="radiogroup">
        {Object.entries(appearanceLabels).map(([mode, label]) => <Pressable key={mode} onPress={() => setAppearance(mode)} accessibilityRole="radio" accessibilityState={{ checked: mode === preference }}
          style={({ pressed }) => [styles.choice, mode === preference && styles.selected, pressed && { backgroundColor: colors.selection }]}>
          <Text style={[styles.label, { flex: 1 }]}>{label}</Text><Ionicons name={mode === preference ? "radio-button-on" : "radio-button-off"} size={22} color={colors.action} />
        </Pressable>)}
        <Text style={styles.note}>Saved on this device.</Text>
      </View> : null}
      <View style={styles.panel}>
        <View style={styles.preferenceRow}><View style={{ flex: 1 }}><Text style={styles.label}>App opening animation</Text><Text style={styles.note}>Play the opening animation and its sound when Printlly starts. Turn this off to skip both.</Text></View>
          <Switch value={openingEnabled} onValueChange={setOpeningEnabled} disabled={!openingReady} accessibilityLabel="App opening animation and sound" accessibilityState={{ disabled: !openingReady }} trackColor={{ false: colors.divider, true: colors.action }} thumbColor={colors.surface} />
        </View>
        <Text style={styles.note}>{reducedMotion ? "Saved on this device. Your device’s Reduce motion setting currently skips the animation and opening sound." : "Saved on this device. Opening sound follows your device’s sound settings."}</Text>
      </View>
      <AccountRow title="Location" detail={locationStatus === "granted" ? "Device location allowed" : "Manage location permission on your device"} onPress={deviceSettings} />
      <AccountRow title="Motion" detail={reducedMotion ? "Reduced motion is on" : "Uses your device accessibility setting"} onPress={() => toggle("motion")} />
      {section === "motion" ? <View style={styles.panel}><Text style={styles.body}>Printlly follows the Reduce motion setting on your device. Essential payment and order updates remain visible.</Text></View> : null}
      <AccountRow title="Document handling" detail="What happens to your uploaded files" onPress={() => toggle("privacy")} />
      {section === "privacy" ? <View style={styles.panel}><Text style={styles.body}>Your uploaded files are removed after collection or expiry. Order history keeps filenames and print settings.</Text><Button title="Help & support" variant="text" onPress={() => navigation.navigate("HelpSupport")} /></View> : null}
    </View>
    {appearanceError || openingError || error ? <Text style={styles.error} accessibilityLiveRegion="polite">{appearanceError || openingError || error}</Text> : null}
    <Button title="Sign out" variant="secondary" onPress={signOut} style={styles.signOut} />
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  rows: { gap: 20 }, panel: { backgroundColor: colors.surface, padding: 16, borderRadius: radius.md, gap: 12 },
  preferenceRow: { flexDirection: "row", alignItems: "center", gap: 12 }, choice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.button },
  selected: { backgroundColor: colors.selection }, label: { ...typography.bodyMedium, color: colors.textPrimary, flexShrink: 1 },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, body: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error, marginTop: 16 }, signOut: { marginTop: 20 },
});
