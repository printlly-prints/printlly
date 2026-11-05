import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import MascotReaction from "../components/MascotReaction";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { toDemoCredentials } from "../constants/demoAuth";
import { typography, radius } from "../theme";

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params, { login } = useAuth(), { colors } = useTheme();
  const styles = useThemedStyles(createStyles), input = useRef(null), verifying = useRef(false);
  const [code, setCode] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(false), [showHelp, setShowHelp] = useState(false);
  const verify = async () => {
    if (verifying.current) return;
    if (code !== "123") { setError("This development preview uses code 123. Try again."); return; }
    verifying.current = true; setError(""); setLoading(true);
    try {
      const { email, password } = toDemoCredentials(phone);
      await login(email, password);
    } catch (err) {
      if (err.response?.status === 401) navigation.navigate("AccountSetup", { phone });
      else setError(err.response?.data?.message || err.message || "Could not sign in. Try again.");
    } finally { verifying.current = false; setLoading(false); }
  };
  return <ScreenFrame title="Verify your number" onBack={() => navigation.goBack()} footer={<Button title="Verify" loading={loading} onPress={verify} />}>
    <View style={styles.heading}>
      {error ? <MascotReaction reaction="access_expired" /> : <View style={styles.statusIcon}><Ionicons name="shield-checkmark-outline" size={28} color={colors.action} /></View>}
      <Text style={styles.title}>Enter your login code</Text>
    </View>
    <Text style={styles.phone}>Continue with +91 {phone}</Text>
    <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.codeRow}>
      {Array.from({ length: 6 }, (_, index) => <View key={index} style={styles.cell} accessible={false}><Text style={styles.digit}>{code[index] || ""}</Text></View>)}
      <TextInput ref={input} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad"
        autoComplete="sms-otp" textContentType="oneTimeCode" autoFocus maxLength={6} caretHidden style={styles.codeInput}
        accessibilityLabel="Login code" accessibilityHint="Development preview. Use code 123." onSubmitEditing={verify} />
    </Pressable>
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button title="Show demo code" variant="secondary" onPress={() => setShowHelp(true)} style={{ marginTop: 16 }} />
    <Text style={styles.note}>Development preview · use 123. No SMS is sent.</Text>
    {showHelp ? <Text style={styles.note} accessibilityLiveRegion="polite">The demo code is 123. You can enter it above.</Text> : null}
    <Text style={styles.note}>Never share your login code.</Text>
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  heading: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 }, statusIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.selection, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, color: colors.textPrimary, flex: 1 }, phone: { ...typography.body, color: colors.textSecondary, marginBottom: 16 },
  codeRow: { flexDirection: "row", gap: 8, minHeight: 56 }, cell: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.button, backgroundColor: colors.surface },
  digit: { ...typography.h2, color: colors.textPrimary, fontVariant: ["tabular-nums"] }, codeInput: { position: "absolute", inset: 0, opacity: 0.01, color: "transparent", fontSize: 24 },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: 16 }, error: { ...typography.bodySmall, color: colors.error, marginTop: 12 },
});
