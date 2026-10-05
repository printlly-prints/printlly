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
import { colors, typography, spacing, radius } from "../theme";

// Step 3 of the demo login - only reached for a phone number with no
// existing account. Collects just a name; the email/password the real
// backend account needs are derived automatically (constants/demoAuth.js)
// so this demo flow never has to show a password field.
export default function AccountSetupScreen({ route }) {
  const { phone } = route.params;
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      // Inside the try, not before it: toDemoCredentials throws outright
      // in any non-development build (see constants/demoAuth.js's own
      // comment) - this is the layer-2 backstop for that, surfacing its
      // message the same way a failed registration would rather than
      // crashing the screen.
      const { email, password } = toDemoCredentials(phone);
      await register({ name: name.trim(), phone, email, password });
      // AuthContext flips isAuthenticated on success; the navigator swaps
      // to the main stack (shop list) on its own.
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Could not create your account. Please try again.");
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
        <Text style={styles.title}>Set up your account</Text>
        <Text style={styles.subtitle}>Just your name - you're almost there.</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Priya Sharma"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Get started" onPress={handleSubmit} loading={loading} />
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
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    ...typography.bodyMedium,
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
