import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Platform, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import Button from "../components/Button";
import Card from "../components/Card";
import ScreenFrame from "../components/ScreenFrame";
import RecoveryState from "../components/RecoveryState";
import { retryAfterSeconds } from "../utils/requestRecovery";
import { paymentNextStep, paymentRecoveryState } from "../utils/paymentRecovery";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useEventSounds } from "../context/EventSoundsContext";
import { useOrderDraft } from "../context/OrderDraftContext";
import { trackEvent, EVENTS } from "../lib/analytics";
import { typography } from "../theme";
import { createPaymentAttemptGuard } from "../utils/paymentAttempt";
import { createPaymentProofStore, validVerificationProof } from "../utils/paymentProofStore";
import { upiCheckoutOptions, upiIntentUrl } from "../utils/razorpayCheckout";
import { formatRupees } from "../components/PriceBreakdown";

function buildCheckoutHtml(params) {
  const serialized = JSON.stringify(upiCheckoutOptions(params)).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="background:${params.canvas}">
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
  function post(payload){payload.attemptId=${params.attemptId};window.ReactNativeWebView.postMessage(JSON.stringify(payload));}
  var options=${serialized};options.handler=function(payment){post({status:'success',payment:payment});};
  options.modal={ondismiss:function(){post({status:'dismissed'});}};
  try{var rzp=new Razorpay(options);rzp.on('payment.failed',function(resp){post({status:'failed',message:resp.error&&resp.error.description});});rzp.open();}catch(e){post({status:'failed',message:String(e)});}
  </script></body></html>`;
}
export default function PaymentScreen({ route, navigation }) {
  const { orderId, estimatedAmount } = route.params, { user, token: sessionToken, isCurrentSession } = useAuth(), { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const { notifyConfirmed } = useEventSounds(), { clearDraft } = useOrderDraft();
  const [retryUntil, setRetryUntil] = useState(0), [now, setNow] = useState(Date.now());
  const [recovery, setRecovery] = useState(paymentRecoveryState()), [canContinue, setCanContinue] = useState(false);
  const [phase, setPhase] = useState("preparing"), [error, setError] = useState(""), [checkout, setCheckout] = useState(null);
  const guard = useRef(createPaymentAttemptGuard()).current, record = useRef(null), inMemoryProof = useRef(null), restored = useRef(false), phaseRef = useRef(phase), currentAttempt = useRef(null);
  phaseRef.current = phase;
  useEffect(() => { if (!retryUntil) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryUntil]);
  const waitSeconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const noteFailure = (failure) => { setRetryUntil(Date.now() + retryAfterSeconds(failure?.response?.headers?.["retry-after"]) * 1000); setNow(Date.now()); setRecovery(paymentRecoveryState({ failure })); };
  const accountId = String(user?.id || user?._id || "");
  const live = () => isCurrentSession(accountId, sessionToken);
  const store = useMemo(() => createPaymentProofStore(AsyncStorage, { accountId, orderId: String(orderId) }), [accountId, orderId]);
  const finish = async (order, attemptId) => {
    if (!live()) return;
    if (order.payment_status !== "paid" || String(order._id) !== String(orderId)) throw new Error("Payment has not been confirmed by the server. Check again.");
    if (!guard.finishVerification(attemptId, true)) return;
    clearDraft(); inMemoryProof.current = null;
    // A failed cleanup cannot cause a second charge: every future entry
    // first reconciles the server's paid order before reading this proof.
    try { await store.clear(); } catch {}
    if (!guard.isCurrent(attemptId) || !live()) return;
    notifyConfirmed({ event: "PAYMENT_CONFIRMED", orderId: order._id }, order);
    navigation.reset({ index: 1, routes: [{ name: "MainTabs", params: { screen: "Home" } }, { name: ["completed", "cancelled", "expired"].includes(order.status) ? "OrderTracking" : "OrderPlaced", params: { order } }] });
  };
  const verify = async (proof, attemptId) => {
    inMemoryProof.current = proof; setPhase("verifying");
    let storageWarning = "";
    try { record.current = await store.save(record.current.checkout, proof); }
    catch { storageWarning = "Recovery details could not be saved. Keep this screen open while checking payment. "; }
    if (!guard.isCurrent(attemptId) || !live()) return;
    try {
      const { data } = await api.post("/payments/razorpay/verify", { order_id: orderId, ...proof });
      await finish(data.order || {}, attemptId);
    } catch (failure) {
      if (!guard.finishVerification(attemptId, false) || !live()) return;
      noteFailure(failure); setCanContinue(false);
      setError(storageWarning); setPhase("error");
    }
  };
  const prepare = async (attemptId) => {
    if (!guard.isCurrent(attemptId) || !live()) return;
    let params = record.current?.checkout;
    if (!params) {
      const { data } = await api.post("/payments/razorpay/create-order", { order_id: orderId });
      params = { amountInPaise: data.amount_in_paise, currency: data.currency, razorpayOrderId: data.razorpay_order_id, keyId: data.key_id };
      if (!guard.isCurrent(attemptId) || !live()) return;
      // Persist the provider ID before opening it, including interrupted
      // checkouts where an app switch prevents any success callback.
      record.current = await store.save(params);
    }
    if (!guard.open(attemptId)) return;
    setCheckout({ ...params, attemptId }); setPhase("checkout");
  };
  const recover = async (allowCheckout = false) => {
    if (Date.now() < retryUntil) return;
    const attemptId = guard.begin(); if (attemptId === null) return;
    currentAttempt.current = attemptId; setPhase("preparing"); setError(""); setCanContinue(false);
    try {
      // Mandatory on FIRST entry and every retry. A response lost after
      // verification or a late webhook must not replace the original ID.
      const { data: orders } = await api.get("/orders/customer");
      if (!guard.isCurrent(attemptId) || !live()) return;
      const order = orders.find((item) => String(item._id) === String(orderId));
      const serverAction = paymentNextStep(order);
      if (serverAction === "missing") throw new Error("Could not find this order.");
      if (serverAction === "track") { guard.failPreparation(attemptId); try { await store.clear(); } catch {} if (guard.isCurrent(attemptId) && live()) navigation.replace("OrderTracking", { order }); return; }
      if (serverAction === "confirmed") { guard.open(attemptId); guard.startVerification(attemptId); await finish(order, attemptId); return; }
      if (!restored.current) { record.current = await store.read(); restored.current = true; }
      if (!guard.isCurrent(attemptId) || !live()) return;
      const proof = inMemoryProof.current || record.current?.proof;
      if (order.payment_status === "failed" && (!allowCheckout || proof)) { guard.failPreparation(attemptId); setRecovery(paymentRecoveryState({ order })); setCanContinue(!proof); setPhase("error"); }
      else if (proof) { guard.open(attemptId); if (guard.startVerification(attemptId)) await verify(proof, attemptId); }
      else if (paymentNextStep(order, { allowCheckout }) === "checkout") await prepare(attemptId);
      else { guard.failPreparation(attemptId); setRecovery(paymentRecoveryState({ order })); setCanContinue(["created", "failed"].includes(order.payment_status)); setPhase("error"); }
    } catch (failure) {
      if (!guard.failPreparation(attemptId)) return;
      if (!live()) return;
      noteFailure(failure); setError(""); setPhase("error");
    }
  };
  const reconcileOpenCheckout = async () => {
    if (phaseRef.current !== "checkout") return;
    const attemptId = currentAttempt.current;
    try {
      const { data: orders } = await api.get("/orders/customer");
      if (phaseRef.current !== "checkout" || !guard.isCurrent(attemptId) || !live()) return;
      const order = orders.find((item) => String(item._id) === String(orderId));
      if (order?.payment_status === "paid" && guard.startVerification(attemptId)) { setPhase("verifying"); await finish(order, attemptId); }
      else if (order && ["cancelled", "expired", "completed"].includes(order.status) && guard.closeCheckout(attemptId)) navigation.replace("OrderTracking", { order });
    } catch { /* Keep checkout and its original provider ID; retry checks the server. */ }
  };
  const resumeCheck = useRef(reconcileOpenCheckout); resumeCheck.current = reconcileOpenCheckout;
  useEffect(() => {
    recover(route.params.startCheckout === true); trackEvent(EVENTS.PAYMENT_STARTED, { order_id: String(orderId) });
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") resumeCheck.current(); });
    const interval = setInterval(() => { if (AppState.currentState === "active") resumeCheck.current(); }, 10000);
    return () => { subscription.remove(); clearInterval(interval); guard.dispose(); };
  }, []);
  const handleMessage = (event) => {
    let payload; try { payload = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (payload?.status === "success") {
      if (!live() || !validVerificationProof(payload.payment) || payload.payment.razorpay_order_id !== record.current?.checkout.razorpayOrderId || !guard.startVerification(payload.attemptId)) return;
      const proof = { razorpay_order_id: payload.payment.razorpay_order_id, razorpay_payment_id: payload.payment.razorpay_payment_id, razorpay_signature: payload.payment.razorpay_signature };
      verify(proof, payload.attemptId);
    } else if (live() && ["dismissed", "failed"].includes(payload?.status) && guard.closeCheckout(payload.attemptId)) {
      setRecovery(paymentRecoveryState({ cancelled: payload.status === "dismissed" })); setCanContinue(false); setError(""); setPhase("error");
    }
  };
  const checkoutUnavailable = () => {
    if (!live() || !guard.closeCheckout(currentAttempt.current)) return;
    setRecovery(paymentRecoveryState()); setCanContinue(false); setError(""); setPhase("error");
  };
  const allowRequest = (request) => {
    const intent = upiIntentUrl(request.url);
    if (intent) {
      Linking.openURL(intent).catch(() => { setError("No UPI app could be opened. Choose another UPI option in secure checkout."); });
      return false;
    }
    return /^(https:\/\/|about:blank|data:)/.test(request.url);
  };
  const pending = phase === "preparing" || phase === "verifying";
  const footer = phase === "error" ? <><Button title={waitSeconds ? `Check status in ${waitSeconds}s` : "Check status"} disabled={waitSeconds > 0} onPress={() => recover(false)} />{canContinue ? <Button title="Continue with UPI" disabled={waitSeconds > 0} variant="secondary" onPress={() => recover(true)} /> : null}<Button title="Get help" variant="secondary" onPress={() => navigation.navigate("HelpSupport")} /></> : null;
  return <ScreenFrame title="Payment" onBack={() => navigation.goBack()} scroll={phase !== "checkout"} footer={footer} contentStyle={phase === "checkout" ? { padding: 0, maxWidth: undefined } : undefined}>
    {phase === "checkout" && Platform.OS !== "web" ? <>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <WebView key={checkout.attemptId} style={{ flex: 1 }} originWhitelist={["*"]} source={{ html: buildCheckoutHtml({ ...checkout, user, actionColor: colors.action, canvas: colors.canvas }), baseUrl: "https://checkout.razorpay.com" }} onMessage={handleMessage} onError={checkoutUnavailable} onHttpError={checkoutUnavailable} onRenderProcessGone={checkoutUnavailable} onShouldStartLoadWithRequest={allowRequest} javaScriptEnabled startInLoadingState />
    </> : phase === "error" ? <><RecoveryState {...recovery} />{error ? <Text style={styles.error}>{error}</Text> : null}{estimatedAmount != null ? <Card style={styles.receipt}><Text style={styles.receiptLabel}>Order total</Text><Text style={styles.receiptAmount}>{formatRupees(estimatedAmount)}</Text></Card> : null}</> : <View style={styles.center}>
      {pending ? <ActivityIndicator size="large" color={colors.action} /> : null}
      <Text style={styles.title}>{phase === "verifying" ? "Confirming payment." : phase === "preparing" ? "Hold on." : phase === "checkout" ? "Continue in the Android app." : "Let's check your payment."}</Text>
      <Text style={styles.subtitle}>{pending ? "Your pickup code appears after the server confirms payment." : phase === "checkout" ? "UPI app checkout requires the native app. This browser preview cannot complete a native payment." : "An uncertain payment will reuse its original checkout and verification details."}</Text>
      {estimatedAmount != null ? <Text style={styles.amount}>{formatRupees(estimatedAmount)}</Text> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>}
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({ receipt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, receiptLabel: { ...typography.body, color: colors.textSecondary }, receiptAmount: { ...typography.h3, color: colors.textPrimary }, center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 32 }, title: { ...typography.h1, color: colors.textPrimary, textAlign: "center", marginTop: 24 }, subtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: 12 }, amount: { ...typography.h2, color: colors.textPrimary, marginTop: 24 }, error: { ...typography.bodySmall, color: colors.error, backgroundColor: colors.errorSurface, padding: 16, borderRadius: 16, marginTop: 16 } });
