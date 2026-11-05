import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import Card from "../components/Card";
import CartItem from "../components/CartItem";
import PriceBreakdown, { formatRupees } from "../components/PriceBreakdown";
import api from "../api/client";
import { toComparePricingDocuments, toOrderDocuments } from "../utils/documentSettings";
import { receiptSnapshot } from "../utils/receiptSnapshot";
import { typography, spacing, radius } from "../theme";
import ScreenFrame from "../components/ScreenFrame";
import RecoveryState from "../components/RecoveryState";
import { recoveryForError } from "../utils/requestRecovery";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { useOrderDraft } from "../context/OrderDraftContext";
import { useAuth } from "../context/AuthContext";

// One review-and-pay page. Document edits are quoted by the server;
// creation freezes the receipt before the existing UPI payment flow.
export default function ReviewCheckoutScreen({ route, navigation }) {
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const { getDraft, setDraft } = useOrderDraft();
  const { user, token: sessionToken, isCurrentSession } = useAuth();
  const insets = useSafeAreaInsets();
  const params = route.params;
  const { shop, notes } = params;

  const [uploadedDocs, setUploadedDocs] = useState(params.uploadedDocs);
  const [docSettings, setDocSettings] = useState(params.docSettings);
  useEffect(() => { setDraft({ ...getDraft(), uploadedDocs, docSettings, notes }); }, [uploadedDocs, docSettings, notes, getDraft, setDraft]);
  const [quote, setQuote] = useState({
    priceBreakdown: params.priceBreakdown,
    totalAmount: params.totalAmount,
    documentTotals: params.documentTotals,
    documentServices: params.documentServices,
  });
  const [repricing, setRepricing] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [repriceFailed, setRepriceFailed] = useState(false), [uploadsExpired, setUploadsExpired] = useState(false);
  const fingerprint = JSON.stringify([shop._id, uploadedDocs.map((doc) => doc.upload_id), docSettings, notes]);
  const saved = getDraft();
  const [order, setOrder] = useState(() => saved?.orderFingerprint === fingerprint ? saved.createdOrder : null);
  const [uncertain, setUncertain] = useState(Boolean(saved?.creationUncertain));
  const [placing, setPlacing] = useState(false), [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestToken.current += 1; }; }, []);
  const locked = Boolean(order || uncertain || placing);
  const receipt = receiptSnapshot(quote, order);
  const amount = receipt.total, bill = receipt.breakdown || {};
  const checkoutDocs = receipt.documents || uploadedDocs;
  const rows = [{ label: "Printing", value: bill.base_subtotal }, bill.paper_size_charge > 0 && { label: "Paper size", value: bill.paper_size_charge }, bill.sides_charge > 0 && { label: "Sides", value: bill.sides_charge }, bill.services_charge > 0 && { label: "Finishing", value: bill.services_charge }, { label: "Platform fee", value: bill.platform_fee }];

  // Fresh shop details support changing shops / adding files. Their current
  // catalogue rates never replace the existing server quote shown here.
  const [shopDetail, setShopDetail] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/shops/${shop._id}`)
      .then(({ data }) => {
        if (!cancelled) setShopDetail(data);
      })
      .catch(() => {
        // Non-fatal: the recorded server quote still shows.
      });
    return () => {
      cancelled = true;
    };
  }, [shop._id]);

  // Re-quote after an edit. Keyed on a token so a slow earlier response
  // can never overwrite a newer one - tapping "+" three times quickly
  // otherwise leaves whichever request happens to land last in charge.
  const requestToken = useRef(0);
  const reprice = useCallback(
    async (nextDocs, nextSettings) => {
      const token = ++requestToken.current;
      setRepricing(true);
      setRepriceFailed(false);
      setError(""); setRecovery(null);
      try {
        const { data } = await api.post("/shops/compare-pricing", {
          documents: toComparePricingDocuments(nextDocs, nextSettings),
          shop_id: shop._id,
        });
        if (token !== requestToken.current) return;

        const result = data?.[0];
        if (!result) {
          setRepriceFailed(true);
          setRecovery({ reaction: "shop_unavailable", title: "This shop is unavailable.", message: "Choose another shop. Your files and print options stay here." });
          return;
        }
        setQuote({
          priceBreakdown: result.price_breakdown,
          totalAmount: result.total_amount,
          documentTotals: result.document_totals,
          documentServices: result.document_services,
        });
      } catch (err) {
        if (token !== requestToken.current) return;
        setRepriceFailed(true);
        setRecovery(recoveryForError(err, { notFound: "shop_unavailable" }));
      } finally {
        if (token === requestToken.current) setRepricing(false);
      }
    },
    [shop._id, shop.shop_name]
  );

  const setCopies = (index, copies) => {
    if (locked) return;
    const nextSettings = docSettings.map((s, i) => (i === index ? { ...s, copies } : s));
    setDocSettings(nextSettings);
    reprice(uploadedDocs, nextSettings);
  };

  const removeDoc = (index) => {
    if (locked) return;
    const nextDocs = uploadedDocs.filter((_, i) => i !== index);
    const nextSettings = docSettings.filter((_, i) => i !== index);
    setUploadedDocs(nextDocs);
    setDocSettings(nextSettings);
    reprice(nextDocs, nextSettings);
  };

  const startPayment = (currentOrder) => navigation.navigate("Payment", { orderId: currentOrder._id, estimatedAmount: currentOrder.total_amount, preferredMethod: "upi", startCheckout: true, breakdown: { subtotal: currentOrder.base_subtotal, platformFee: currentOrder.platform_fee, total: currentOrder.total_amount } });
  const payNow = async () => {
    if (inFlight.current || repricing || repriceFailed || uploadsExpired || uncertain || amount === null || !uploadedDocs.length) return;
    const accountId = String(user?.id || user?._id || ""), expectedToken = sessionToken;
    const sameSession = () => isCurrentSession(accountId, expectedToken);
    if (!sameSession()) return;
    if (order) { startPayment(order); return; }
    inFlight.current = true; setPlacing(true); setError(""); setRecovery(null);
    try {
      const { data } = await api.post("/orders", { shop_id: shop._id, documents: toOrderDocuments(uploadedDocs, docSettings, quote.documentServices), instructions: notes });
      // Save after navigating away only while this account/session is live.
      if (!sameSession()) return;
      setDraft({ ...getDraft(), createdOrder: data, orderFingerprint: fingerprint, creationUncertain: false });
      if (!mounted.current) return;
      setOrder(data);
      if (receiptSnapshot(quote, data).total === null) setError("The confirmed total is unavailable. Check My Orders before paying.");
      else if (Number(data.total_amount) !== Number(quote.totalAmount)) setError(`The confirmed total changed to ${formatRupees(data.total_amount)}. Review the breakdown, then tap Pay to continue.`);
      else startPayment(data);
    } catch (failure) {
      if (!sameSession()) return;
      if (!failure.response) {
        setDraft({ ...getDraft(), creationUncertain: true });
        if (mounted.current) { setUncertain(true); setRecovery({ reaction: "offline", title: "We couldn�t confirm your order.", message: "Check My Orders before placing another order. Your files and options stay saved." }); }
      } else if (mounted.current) {
        setUploadsExpired(failure.response.status === 410 && failure.response.data?.code === "UPLOAD_EXPIRED");
        const expired = failure.response.status === 410 && failure.response.data?.code === "UPLOAD_EXPIRED";
        const unavailable = failure.response.status === 404 && /shop/i.test(failure.response.data?.message || "") || failure.response.status === 400 && /shop.*closed/i.test(failure.response.data?.message || "");
        if (expired) setRecovery({ reaction: "upload_failed", title: "These uploads have expired.", message: "Choose the files again to get a fresh upload. Your print notes stay saved." });
        else if (unavailable) { setRepriceFailed(true); setRecovery({ reaction: "shop_unavailable", title: "This shop is unavailable.", message: "Choose another available shop. Your files and print options stay here." }); }
        else if ([401,403,429].includes(failure.response.status) || failure.response.status >= 500) setRecovery(recoveryForError(failure));
        else setError(failure.response?.data?.message || "Could not create this order. Please try again.");
      }
    } finally { inFlight.current = false; if (mounted.current && sameSession()) setPlacing(false); }
  };

  const chooseShop = () => navigation.navigate("SelectShop", { uploadedDocs, docSettings, notes });
  const itemCount = uploadedDocs.length;
  const uploadAgain = () => {
    const preselectedShop = shopDetail || shop;
    setDraft({ notes, preselectedShop, uploadedDocs: [], docSettings: [] });
    navigation.push("UploadDocuments", { preselectedShop, uploadedDocs: [] });
  };

  return (
    <ScreenFrame title="Review & pay" onBack={() => navigation.goBack()} footer={uncertain ? <Button title="Check My Orders" onPress={() => navigation.navigate("MainTabs", { screen: "Orders" })} /> : <View style={styles.paymentFooter}><Pressable style={styles.paymentMethod} accessibilityRole="button" accessibilityLabel="Choose payment method, UPI selected" onPress={() => setPaymentMethodsOpen(true)}><Ionicons name="wallet-outline" size={22} color={colors.action} /><View style={{ flexShrink: 1 }}><Text style={styles.totalLabel}>UPI</Text><Text style={styles.addMoreBody}>Choose UPI app</Text></View><Ionicons name="chevron-down" size={16} color={colors.textSecondary} /></Pressable><View style={{ flex: 1 }}><Button title={`Pay ${formatRupees(amount)}`} onPress={payNow} loading={placing} disabled={repricing || (repriceFailed || uploadsExpired) || itemCount === 0 || amount === null} /></View></View>}>
        <Card style={styles.shopCard}><Text style={styles.shopName}>{shop.shop_name}</Text><Text style={styles.addMoreBody}>{itemCount} file{itemCount === 1 ? "" : "s"} · pickup{shop.address ? ` at ${shop.address}` : " from shop"}</Text></Card>
        <Text style={styles.subtitle}>{order ? "Order created. Continue with UPI payment below." : "Review your files and the full price before paying."}</Text>

        <Card style={styles.itemsCard}>
          {checkoutDocs.map((doc, i) => (
            <View key={doc.upload_id}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <CartItem
                name={doc.original_name}
                pageCount={doc.page_count}
                settings={receipt.documents ? doc : docSettings[i]}
                copies={receipt.documents ? doc.copies : docSettings[i]?.copies}
                services={receipt.documents ? doc.services : quote.documentServices?.[i]}
                total={repricing ? undefined : receipt.documents ? doc.pricing?.document_total : quote.documentTotals?.[i]}
                editable={!locked}
                canRemove={itemCount > 1}
                onChangeCopies={(copies) => setCopies(i, copies)}
                onRemove={() => removeDoc(i)}
              />
            </View>
          ))}
        </Card>

        {/* Lightweight on purpose - it is an escape hatch back into the
            upload flow, not a competing call to action. Settings for the
            documents already here are carried forward. */}
        {!locked ? <Pressable
          onPress={() =>
            navigation.navigate("UploadDocuments", { preselectedShop: shopDetail || shop, uploadedDocs })
          }
          style={({ pressed }) => [styles.addMore, pressed && styles.addMorePressed]}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primaryBright} />
          <View>
            <Text style={styles.addMoreTitle}>Add more files</Text>
            <Text style={styles.addMoreBody}>Upload and add to your cart</Text>
          </View>
        </Pressable> : null}

        {recovery ? <RecoveryState compact {...recovery}
          primaryLabel={uploadsExpired ? "Choose files again" : recovery.reaction === "shop_unavailable" ? "Find another shop" : repriceFailed ? "Retry price update" : undefined}
          onPrimary={uploadsExpired ? uploadAgain : recovery.reaction === "shop_unavailable" ? chooseShop : repriceFailed ? () => reprice(uploadedDocs, docSettings) : undefined}
          loading={repricing || placing} /> : null}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>{repriceFailed ? <Button title="Retry price update" variant="secondary" onPress={() => reprice(uploadedDocs, docSettings)} /> : null}{uploadsExpired ? <Button title="Upload files again" variant="secondary" onPress={uploadAgain} /> : null}
          </View>
        ) : null}

        <Card style={styles.totalCard}><Text style={styles.totalLabel}>Price breakdown</Text>{repricing ? <View style={styles.updating}><ActivityIndicator color={colors.action} /><Text style={styles.addMoreBody}>Updating the shop's price…</Text></View> : <PriceBreakdown rows={rows} total={amount} />}</Card>
        {notes ? <Card style={styles.notesCard}><Text style={styles.totalLabel}>Note for the shop</Text><Text style={styles.addMoreBody}>{notes}</Text></Card> : null}
        <Text style={styles.subtitle}>Pay securely through a UPI app. Your six-digit pickup code appears only after the server confirms payment.</Text>
        <Modal visible={paymentMethodsOpen} transparent animationType="fade" onRequestClose={() => setPaymentMethodsOpen(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalDismiss} accessibilityRole="button" accessibilityLabel="Close payment methods" onPress={() => setPaymentMethodsOpen(false)} />
            <View style={[styles.paymentSheet, { paddingBottom: Math.max(24, insets.bottom) }]} accessibilityViewIsModal>
              <View style={styles.totalRow}><Text style={styles.shopName} accessibilityRole="header">Payment method</Text><Pressable onPress={() => setPaymentMethodsOpen(false)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close payment methods"><Ionicons name="close" size={24} color={colors.textPrimary} /></Pressable></View>
              <View style={styles.upiOption}><Ionicons name="radio-button-on" size={24} color={colors.action} /><View style={{ flex: 1 }}><Text style={styles.totalLabel}>UPI app</Text><Text style={styles.addMoreBody}>UPI is the only payment method. After you tap Pay, the payment provider lets you choose an available UPI app.</Text></View></View>
              <Button title={`Pay ${formatRupees(amount)} with UPI`} loading={placing} disabled={repricing || (repriceFailed || uploadsExpired) || itemCount === 0 || amount === null} onPress={() => { setPaymentMethodsOpen(false); payNow(); }} />
            </View>
          </View>
        </Modal>
    </ScreenFrame>
  );
}

const createStyles = ({ colors }) => ({
  shopCard: { marginBottom: spacing.md }, shopName: { ...typography.h3, color: colors.textPrimary },
  notesCard: { marginBottom: spacing.md }, updating: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 20 },
  paymentFooter: { flexDirection: "row", gap: 12, alignItems: "center" }, paymentMethod: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }, modalDismiss: { flex: 1 },
  paymentSheet: { backgroundColor: colors.surface, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxWidth: 608, width: "100%", alignSelf: "center" },
  closeButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, upiOption: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginVertical: 20 },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },

  itemsCard: { paddingVertical: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border },

  addMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primaryWash,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  addMorePressed: { opacity: 0.75 },
  addMoreTitle: { ...typography.label, color: colors.primaryDeep },
  addMoreBody: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.danger },

  totalCard: { marginTop: spacing.md, marginBottom: spacing.lg },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { ...typography.label, color: colors.textPrimary },
  totalValue: { ...typography.h2, color: colors.primaryDeep },
  totalNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  continueShopping: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  continueShoppingLabel: { ...typography.label, color: colors.primaryBright },
});

