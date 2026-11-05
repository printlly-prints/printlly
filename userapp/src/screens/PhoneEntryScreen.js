import { useState } from "react";
import { Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import LoginComposition from "../components/LoginComposition";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme";

export default function PhoneEntryScreen({ navigation }) {
  const { colors } = useTheme();
  const [phone, setPhone] = useState(""), [error, setError] = useState("");
  const continueLogin = () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) { setError("Enter a valid 10-digit phone number."); return; }
    setError(""); navigation.navigate("Otp", { phone: digits });
  };
  return <ScreenFrame accessory={<Pressable onPress={() => navigation.navigate("SignInHelp")} accessibilityRole="button" accessibilityLabel="Sign-in help"
    style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", marginRight: -8 }}><Ionicons name="help-circle-outline" size={24} color={colors.textPrimary} /></Pressable>}
    footer={<Button title="Continue" onPress={continueLogin} />}>
    <LoginComposition />
    <FormField label="Phone number" prefix="+91" value={phone} onChangeText={(value) => setPhone(value.replace(/\D/g, ""))}
      keyboardType="phone-pad" autoComplete="tel-national" maxLength={10} placeholder="Enter mobile number" error={error} returnKeyType="done" onSubmitEditing={continueLogin} />
    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 16, lineHeight: 18 }]}>By continuing, you agree to our Terms and Privacy Policy.</Text>
    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 16 }]}>Development preview. No SMS is sent.</Text>
  </ScreenFrame>;
}
