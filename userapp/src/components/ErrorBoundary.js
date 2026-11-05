import { Component } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import RecoveryState from "./RecoveryState";
import { typography } from "../theme";
import { useThemedStyles } from "../context/ThemeContext";
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
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
function ErrorFallback({ onRetry }) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
    <RecoveryState reaction="service_unavailable" title="This screen couldn’t open." message="Try opening it again. If you were making a payment, check your order’s confirmed payment status before trying to pay again." primaryLabel="Try again" onPrimary={onRetry} />
  </ScrollView>;
}
const createStyles = ({ colors }) => ({ screen: { flex: 1, backgroundColor: colors.canvas }, content: { flexGrow: 1, paddingHorizontal: 24, width: "100%", maxWidth: 608, alignSelf: "center" } });
