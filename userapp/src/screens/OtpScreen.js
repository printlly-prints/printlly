import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { toDemoCredentials } from "../constants/demoAuth";
import { colors, statusColors, typography, spacing, radius } from "../theme";

const DEMO_OTP = "123";

// Step 2 of the demo login. No SMS is actually sent - the correct code is
// always "123" (shown on screen so testers aren't left guessing). See
// constants/demoAuth.js for what a real integration would replace this
// with.
//
// After the fake OTP check passes, we try to log in with credentials
// derived from the phone number. If that fails with 401 ("Invalid
// credentials" - the backend gives the same message for "wrong password"
// and "no such user"), we treat it as a new phone number and send the
// user to account setup instead.
export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const { login } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (otp.trim() !== DEMO_OTP) {
      setError("Incorrect OTP. This demo build always uses 123.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      // Inside the try, not before it: toDemoCredentials throws outright
      // in any non-development build (see constants/demoAuth.js's own
      // comment) - this is the layer-2 backstop for that, surfacing its
      // message the same way a failed login would rather than crashing
      // the screen.
      const { email, password } = toDemoCredentials(phone);
      await login(email, password);
      // AuthContext flips isAuthenticated on success; the navigator swaps
      // to the main stack (shop list) on its own.
    } catch (err) {
      if (err.response?.status === 401) {
        navigation.navigate("AccountSetup", { phone });
      } else {
        setError(err.response?.data?.message || err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>Enter the OTP sent to +91 {phone}.</Text>
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>Demo build - the OTP is always 123</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>OTP</Text>
          <TextInput
            style={styles.otpInput}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Verify & Continue" onPress={handleVerify} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: 80, flexGrow: 1 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  // Reuses the "pending" status colour rather than a one-off hex value -
  // this banner is informational, not an error.
  demoBanner: {
    backgroundColor: statusColors.pending.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  demoBannerText: { ...typography.labelSmall, color: statusColors.pending.text, textAlign: "center" },
  field: { marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.textPrimary, marginBottom: spacing.sm },
  otpInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 24,
    letterSpacing: 6,
    color: colors.textPrimary,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    ...typography.bodySmall,
  },
});
