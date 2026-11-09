import { finishPrintFlow } from "../utils/confirmationNavigation";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import Button from "../components/Button";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { trackEvent, EVENTS } from "../lib/analytics";
import { colors, typography, spacing, radius } from "../theme";
import { upiCheckoutDisplay } from "../utils/upiPayments";

// Razorpay's checkout is loaded inside a WebView rather than through
// react-native-razorpay, because that package is a native module and does
// not run in Expo Go.
//
// SECURITY: this screen never trusts its own checkout result. By the time
// it mounts, the Order already exists (created by whoever navigated here
// - see ReviewCheckoutScreen and utils/orderNavigation.js) with
// payment_status "created" and no otp. From there:
//   1. Ask the backend for a Razorpay order (POST /payments/razorpay/
//      create-order) for that order_id - it returns key_id and the exact
//      amount Razorpay will charge, both server-computed.
//   2. Open Razorpay's checkout with THOSE server-provided values.
//   3. Send the resulting razorpay_payment_id/signature to
//      POST /payments/razorpay/verify, which recomputes the HMAC itself
//      and only then marks the order paid and generates the pickup OTP.
// A modified client can report whatever it likes from its own checkout
// handler; none of it matters unless step 3's signature check passes.
function buildCheckoutHtml({
  amountInPaise,
  currency,
  razorpayOrderId,
  keyId,
  user,
  preferredUpiApp,
}) {
  const options = {
    key: keyId,
    amount: amountInPaise,
    currency,
    order_id: razorpayOrderId,
    name: "Paprout",
    description: "Payment for your print order",
    prefill: {
      name: user?.name || "",
      email: user?.email || "",
      contact: user?.phone || "",
      method: "upi",
    },
    config: { display: upiCheckoutDisplay(preferredUpiApp) },
    theme: { color: colors.primaryBright },
  };

  // Escaping "<" keeps a stray "</script>" inside any user-supplied
  // value (e.g. a name) from breaking out of the script tag.
  const serialized = JSON.stringify(options).replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
  <body style="background:${colors.background}">
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <script>
      function post(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      var options = ${serialized};
      options.handler = function (response) { post({ status: "success", payment: response }); };
      options.modal = { ondismiss: function () { post({ status: "cancelled" }); } };
      try {
        var rzp = new Razorpay(options);
        rzp.on("payment.failed", function (resp) {
          post({ status: "failed", message: resp.error && resp.error.description });
        });
        rzp.open();
      } catch (e) {
        post({ status: "failed", message: String(e) });
      }
    </script>
  </body>
</html>`;
}

// Always reached with an EXISTING order_id - either fresh from
// ReviewCheckoutScreen (which just called POST /orders) or resumed for a
// "created"/"failed" order via utils/orderNavigation.js (MyOrdersScreen's
// "Complete payment" button, or a HomeScreen order card). Either way this
// screen's only job from here is to get that one order paid.
export default function PaymentScreen({ route, navigation }) {
  const { orderId, estimatedAmount, breakdown, preferredUpiApp } = route.params;
  const { user } = useAuth();

  // "preparing" (asking the backend for a Razorpay order) -> "checkout"
  // (WebView open) -> "verifying" -> "error" (retry button).
  const [phase, setPhase] = useState("preparing");
  const [error, setError] = useState("");
  const [checkoutParams, setCheckoutParams] = useState(null);

  // Re-runs on every "Retry payment" tap. Safe to call repeatedly for the
  // same order_id - POST /payments/razorpay/create-order always issues a
  // fresh Razorpay order and overwrites the stored one, which is exactly
  // what's needed after a failed attempt (see paymentController.js).
  const prepare = async () => {
    setPhase("preparing");
    setError("");
    try {
      const { data: rzpOrder } = await api.post(
        "/payments/razorpay/create-order",
        {
          order_id: orderId,
        },
      );

      setCheckoutParams({
        amountInPaise: rzpOrder.amount_in_paise,
        currency: rzpOrder.currency,
        razorpayOrderId: rzpOrder.razorpay_order_id,
        keyId: rzpOrder.key_id,
      });
      setPhase("checkout");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not start payment. Please try again.",
      );
      setPhase("error");
    }
  };

  useEffect(() => {
    prepare();
    // payment_started - the customer has reached Razorpay's checkout.
    //
    // This is a CLIENT event on purpose, and it is the clearest example of
    // why the client/server split in src/lib/analytics.js matters: the
    // customer may close the sheet, fail 3-D Secure, or lose signal, and the
    // server would never hear about any of it. Its pair,
    // payment_completed, is emitted by the backend from the authoritative
    // transition in utils/paymentConfirmation.js - so the gap between the two
    // is the real checkout drop-off rather than a guess.
    //
    // No amount, no Razorpay identifiers, no key: the order id is enough to
    // join this to the server-side event.
    trackEvent(EVENTS.PAYMENT_STARTED, { order_id: String(orderId) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyPayment = async (payment) => {
    setPhase("verifying");
    try {
      const { data } = await api.post("/payments/razorpay/verify", {
        order_id: orderId,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
      });
      // The order returned here is the one place otp actually exists -
      // it was generated server-side by the verify call above.
      //
      finishPrintFlow(navigation, data.order);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Payment could not be verified. Please try again or contact support.",
      );
      setPhase("error");
    }
  };

  const handleMessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (payload.status === "success") {
      verifyPayment(payload.payment);
    } else if (payload.status === "cancelled") {
      // The customer backed out of Razorpay's UI without paying - verify
      // is never called (there's nothing to verify) and this isn't an
      // error, so no error screen either. The order is left exactly as
      // it was (payment_status "created"); going back returns to
      // ReviewCheckoutScreen (or wherever this screen was resumed from),
      // and the order can still be paid for later from My Orders as long
      // as it hasn't expired.
      navigation.goBack();
    } else {
      setError(payload.message || "Payment failed. Please try again.");
      setPhase("error");
    }
  };

  if (phase === "preparing") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
        <Text style={styles.centerText}>Preparing secure checkout...</Text>
      </View>
    );
  }

  if (phase === "verifying") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryBright} />
        <Text style={styles.centerText}>Confirming your payment...</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <ScrollView contentContainerStyle={styles.fallback}>
        <Text style={styles.amount}>₹{estimatedAmount}</Text>
        {breakdown && (
          <View style={styles.breakdownBox}>
            <BreakdownRow label="Subtotal" value={breakdown.subtotal} />
            {breakdown.paperSize > 0 ? (
              <BreakdownRow label="Paper size" value={breakdown.paperSize} />
            ) : null}
            {breakdown.sides > 0 ? (
              <BreakdownRow label="Double-sided" value={breakdown.sides} />
            ) : null}
            {breakdown.services > 0 ? (
              <BreakdownRow label="Finishing" value={breakdown.services} />
            ) : null}
            <BreakdownRow label="Platform fee" value={breakdown.platformFee} />
            <View style={styles.breakdownDivider} />
            <BreakdownRow label="Total" value={breakdown.total} emphasized />
          </View>
        )}
        <Text style={styles.error}>{error}</Text>
        <Button title="Retry payment" onPress={prepare} />
        <View style={styles.spacer} />
        <Button
          title="Go back"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    );
  }

  // phase === "checkout"
  return (
    <WebView
      originWhitelist={["*"]}
      source={{
        html: buildCheckoutHtml({ ...checkoutParams, user, preferredUpiApp }),
        baseUrl: "https://checkout.razorpay.com",
      }}
      onMessage={handleMessage}
      javaScriptEnabled
      startInLoadingState
      renderLoading={() => (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primaryBright} />
          <Text style={styles.centerText}>Opening secure checkout...</Text>
        </View>
      )}
    />
  );
}

function BreakdownRow({ label, value, emphasized }) {
  return (
    <View style={styles.breakdownRow}>
      <Text
        style={
          emphasized ? styles.breakdownLabelEmphasized : styles.breakdownLabel
        }
      >
        {label}
      </Text>
      <Text
        style={
          emphasized ? styles.breakdownValueEmphasized : styles.breakdownValue
        }
      >
        ₹{value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  centerText: {
    marginTop: spacing.lg,
    ...typography.body,
    color: colors.textSecondary,
  },
  fallback: {
    padding: spacing.xl,
    paddingTop: 48,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  amount: {
    ...typography.display,
    fontSize: 40,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    ...typography.bodySmall,
    lineHeight: 21,
  },
  spacer: { height: spacing.md },
  breakdownBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  breakdownLabel: { ...typography.bodySmall, color: colors.textSecondary },
  breakdownValue: { ...typography.labelSmall, color: colors.textPrimary },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  breakdownLabelEmphasized: { ...typography.label, color: colors.textPrimary },
  breakdownValueEmphasized: { ...typography.label, color: colors.textPrimary },
});
