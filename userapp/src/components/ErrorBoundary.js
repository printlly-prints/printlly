import { Component } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, typography } from "../theme";
import { trackCrash } from "../lib/analytics";

// What a customer sees if the app throws during render.
//
// Without a boundary, a React Native render error unmounts the root view and
// leaves a blank screen with no way out but force-quitting - and on a release
// build there is no red box and no reload gesture, so the app simply appears
// broken. For a customer standing in a print shop waiting to show a pickup
// code, that is the worst possible moment for it.
//
// WHAT IT CATCHES: errors thrown during render, in lifecycle methods and in
// constructors below it. It does NOT catch errors in event handlers, promises
// or timers - those do not pass through React's rendering. Those are
// currently uncaught in this app, which is one of the reasons proper crash
// reporting (@sentry/react-native) is still outstanding; see
// src/lib/analytics.js for why it has not been added yet.
//
// What it deliberately does NOT show: the error message or any stack trace.
// Neither means anything to a customer, and the reassurance is the useful
// part - and it is true, because the backend is the source of truth. An order
// that has been paid for stays paid whether or not this screen can draw.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError() {
    // Only a flag. The error is reported in componentDidCatch and
    // deliberately not held in state, which would invite a later change that
    // renders it to the customer.
    return { hasError: true };
  }

  componentDidCatch(error) {
    // One countable event, not a crash report - see trackCrash. It makes
    // "how often does this happen" answerable while the app has no Sentry.
    trackCrash(error);
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.screen}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Paprout ran into an unexpected problem on this screen. Your orders
            are safe - nothing has been lost or changed.
          </Text>
          <Text style={styles.note}>
            If you have an order ready to collect, your pickup code is still
            valid and the shop can look your order up.
          </Text>
          <Pressable style={styles.button} onPress={this.reset} accessibilityRole="button">
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 10,
    lineHeight: 19,
  },
  button: {
    marginTop: 26,
    backgroundColor: colors.primary,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 12,
  },
  buttonLabel: {
    ...typography.button,
    color: "#FFFFFF",
  },
});
