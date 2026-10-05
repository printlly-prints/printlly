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
import { colors, typography, spacing, radius } from "../theme";

// Step 1 of the demo login: collect a phone number, move to OtpScreen.
// See constants/demoAuth.js for why this flow is a placeholder rather
// than a real SMS OTP integration.
export default function PhoneEntryScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const handleContinue = () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setError("");
    navigation.navigate("Otp", { phone: digits });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Enter your phone number to get started.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Phone number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Continue" onPress={handleContinue} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingTop: 80, flexGrow: 1 },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  field: { marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, color: colors.textPrimary, marginBottom: spacing.sm },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  prefix: { ...typography.bodyMedium, color: colors.textSecondary, marginRight: spacing.sm },
  phoneInput: { flex: 1, ...typography.bodyMedium, color: colors.textPrimary, paddingVertical: spacing.md },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    ...typography.bodySmall,
  },
});
