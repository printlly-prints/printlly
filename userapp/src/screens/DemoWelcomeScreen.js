import { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import NewPrintComposer from "../components/NewPrintComposer";
import { useAuth } from "../context/AuthContext";
import { colors, typography, spacing } from "../theme";
export default function DemoWelcomeScreen() {
  const { enterDemo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setLoading(true);
    setError("");
    try {
      await enterDemo();
    } catch {
      setError("Couldn't open Paprout. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <Image
          source={require("../../assets/paprout-mark.png")}
          style={styles.mark}
          resizeMode="contain"
          accessible={false}
        />
        <Text style={styles.wordmark}>Paprout</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        Welcome to Paprout
      </Text>
      <Text style={styles.body}>
        Your documents, printed just around the corner.
      </Text>
      <NewPrintComposer
        title="Your first print"
        label="Get started"
        loading={loading}
        onPress={start}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  mark: { width: 32, height: 38 },
  wordmark: { ...typography.h2, color: colors.ink },
  title: { ...typography.h2, color: colors.ink },
  body: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  error: {
    ...typography.bodySmall,
    color: colors.danger,
    marginTop: spacing.lg,
  },
});
