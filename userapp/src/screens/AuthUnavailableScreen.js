import { StyleSheet, Text, View } from "react-native";
import { colors, typography, spacing } from "../theme";

// Rendered in place of the demo phone-login flow (PhoneEntryScreen) in
// any non-development build - see constants/demoAuth.js for why that
// flow (password derived from a phone number alone) must never be
// reachable outside development/testing. App.js is what actually swaps
// the two in based on __DEV__; this screen is just the "nothing to see
// here" stand-in so a production/preview build never renders a blank or
// broken screen instead.
//
// There is currently no real sign-in flow to fall back to (the phone/OTP
// flow IS the only customer sign-in this app has - see demoAuth.js's own
// comment on what should replace it) - this message is deliberately
// plain rather than pretending there's another way in.
export default function AuthUnavailableScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign-in unavailable</Text>
      <Text style={styles.body}>
        This build doesn&rsquo;t have a sign-in method configured yet. Please check back soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: "center", marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
