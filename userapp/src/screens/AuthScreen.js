import { useState } from "react";
import {
  Image,
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
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
import { trackEvent, EVENTS } from "../lib/analytics";
import { validateCustomerAuth } from "../utils/authValidation";
import { colors, fonts, typography, spacing, radius } from "../theme";
import { GOOGLE_SIGN_IN_AVAILABLE } from "../lib/googleSignIn";
import GenderOptions from "../components/GenderOptions";

const API_CONFIGURED = Boolean(process.env.EXPO_PUBLIC_API_BASE_URL);

export default function AuthScreen() {
  const { login, register, loginWithGoogle } = useAuth();
  const insets = useSafeAreaInsets();
  const [signingUp, setSigningUp] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    gender: "prefer_not_to_say",
  });
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const change = (key) => (value) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  const googleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Google sign-in could not be completed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (loading || !API_CONFIGURED) return;
    const message = validateCustomerAuth(fields, signingUp);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (signingUp)
        await register({
          ...fields,
          name: fields.name.trim(),
          phone: fields.phone.trim(),
          email: fields.email.trim(),
        });
      else await login(fields.email.trim(), fields.password);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (!err.isAxiosError && err.message) ||
          "We couldn’t connect. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <View style={styles.brand}>
          <Image
            source={require("../../assets/paprout-mark.png")}
            style={styles.mark}
            accessibilityLabel=""
          />
          <Text style={styles.wordmark}>Paprout</Text>
          <View style={styles.inkDots}>
            <View
              style={[styles.dot, { backgroundColor: colors.primaryAccent }]}
            />
            <View style={[styles.dot, { backgroundColor: colors.magenta }]} />
            <View style={[styles.dot, { backgroundColor: colors.yellow }]} />
          </View>
        </View>
        <View style={styles.intro}>
          <View style={styles.introCopy}>
            <Text style={styles.title}>
              {signingUp ? "Create an account" : "Sign in to Paprout"}
            </Text>
            <Text style={styles.subtitle}>
              Print documents at a shop near you.
            </Text>
          </View>
          <Image
            source={require("../../assets/art/student-cmyk.png")}
            style={styles.character}
            resizeMode="contain"
            accessible={false}
          />
        </View>
        <View style={styles.form}>
          <Text style={styles.formTitle} accessibilityRole="header">
            {signingUp ? "Create your account" : "Welcome back"}
          </Text>
          <Text style={styles.formHint}>
            {signingUp
              ? "A few details, then you’re ready to print."
              : "Sign in to get your next print sorted."}
          </Text>
          {signingUp && (
            <>
              <Field
                label="Full name"
                value={fields.name}
                onChangeText={change("name")}
                autoComplete="name"
                editable={!loading}
              />
              <Field
                label="Phone number"
                value={fields.phone}
                onChangeText={change("phone")}
                autoComplete="tel"
                keyboardType="phone-pad"
                editable={!loading}
              />
            </>
          )}
          <Field
            label="Email address"
            value={fields.email}
            onChangeText={change("email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!loading}
          />
          <View>
            <Field
              label="Password"
              value={fields.password}
              onChangeText={change("password")}
              autoCapitalize="none"
              autoComplete={signingUp ? "new-password" : "current-password"}
              secureTextEntry={!visible}
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={submit}
              password
            />
            <Pressable
              style={styles.eye}
              onPress={() => setVisible(!visible)}
              accessibilityRole="button"
              accessibilityLabel={visible ? "Hide password" : "Show password"}
            >
              <Ionicons
                name={visible ? "eye-off-outline" : "eye-outline"}
                size={21}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
          {signingUp && (
            <Text style={styles.passwordHint}>
              At least 10 characters.
            </Text>
          )}
          {signingUp && (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Gender (optional)</Text>
              <GenderOptions
                value={fields.gender}
                onChange={change("gender")}
                disabled={loading}
              />
              <Text style={styles.passwordHint}>
                You can change this later.
              </Text>
            </View>
          )}
          {error ? (
            <Text
              style={styles.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}
          {!API_CONFIGURED && (
            <Text style={styles.error}>
              Sign-in is currently unavailable. Please try again later.
            </Text>
          )}
          <Button
            title={signingUp ? "Create account" : "Sign in"}
            onPress={submit}
            loading={loading}
            disabled={!API_CONFIGURED}
            icon="arrow-forward"
            style={styles.submit}
          />
          <Button
            title="Continue with Google"
            variant="secondary"
            icon="logo-google"
            onPress={googleLogin}
            disabled={loading || !API_CONFIGURED || !GOOGLE_SIGN_IN_AVAILABLE}
          />
          {!GOOGLE_SIGN_IN_AVAILABLE && (
            <Text style={styles.passwordHint}>
              Google sign-in is not available in this build. You can use email
              above.
            </Text>
          )}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {signingUp ? "Already have an account?" : "New to Paprout?"}
            </Text>
            <Pressable
              disabled={loading}
              onPress={() => {
                if (!signingUp) trackEvent(EVENTS.SIGNUP_STARTED);
                setSigningUp(!signingUp);
                setError("");
                setFields((p) => ({ ...p, password: "" }));
              }}
              accessibilityRole="button"
              style={styles.switchButton}
            >
              <Text style={styles.switchLabel}>
                {signingUp ? "Sign in" : "Create account"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, password, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          password && styles.passwordInput,
          focused && styles.focused,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: 24,
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 29, height: 34 },
  wordmark: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 25,
    letterSpacing: -1,
    color: colors.ink,
  },
  inkDots: { flexDirection: "row", gap: 4, marginLeft: "auto" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 28,
    marginBottom: 24,
    minHeight: 184,
  },
  introCopy: { flex: 1, zIndex: 1 },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primaryDeep,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 12,
  },
  character: { width: "32%", height: 188, marginLeft: 4 },
  form: { paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border },
  formTitle: { ...typography.h2, color: colors.textPrimary, fontSize: 23 },
  formHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 24,
  },
  field: { marginBottom: 16 },
  label: {
    ...typography.labelSmall,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  input: {
    ...typography.body,
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  passwordInput: { paddingRight: 52 },
  focused: {
    borderColor: colors.primary,
    borderWidth: 2,
    paddingHorizontal: 15,
  },
  eye: {
    position: "absolute",
    right: 2,
    top: 31,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  error: {
    ...typography.bodySmall,
    color: colors.dangerText,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: radius.sm,
    marginBottom: 16,
  },
  submit: { marginTop: 4 },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 6,
    marginTop: 12,
  },
  switchText: { ...typography.bodySmall, color: colors.textSecondary },
  switchButton: { minHeight: 48, justifyContent: "center" },
  switchLabel: { ...typography.labelSmall, color: colors.primary },
});
