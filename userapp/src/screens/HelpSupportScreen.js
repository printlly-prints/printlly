import { useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import Button from "../components/Button";
import { AccountRow } from "./ProfileScreen";
import { useSupport } from "../context/SupportContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_CONTACT_CONFIGURED } from "../config/support";
import { typography, radius } from "../theme";

const TOPICS = [
  { title: "Payment & refund", detail: "Help with a payment", answers: [
    ["Money was deducted, but the order is unpaid", "Check the payment status in Your orders before paying again. If the payment remains unconfirmed, contact support with your order reference."],
    ["My payment failed", "Your unpaid order remains in Your orders until it expires. Open it to check the current payment status and continue payment."],
  ] },
  { title: "Pickup & collection", detail: "Your pickup code and order status", answers: [
    ["How do I collect my prints?", "Your six-digit pickup code appears after payment is confirmed. When the order is ready for pickup, show the code at the shop. The shop confirms collection with that code."],
    ["Can I change or cancel a paid order?", "Changes and cancellation are unavailable in the app. Contact support about your paid order."],
    ["Why did my order expire?", "Unpaid orders expire after about an hour. Pending or accepted orders can expire after 48 hours without progress. Ready-for-pickup orders are excluded from that expiry window."],
  ] },
  { title: "Uploading files", detail: "Help with PDFs and images", answers: [
    ["A file could not be uploaded", "Retry the failed file or choose another file. Uploads allow up to 10 files at a time, with a 10 MB limit per file."],
    ["What happens to my files?", "Uploaded files are removed after collection or expiry. Your order history keeps filenames and print settings."],
    ["Why are shop prices different?", "Each shop sets its printing prices and finishing services. Compare the itemized quote for your files before placing an order."],
  ] },
];
const configuredContacts = SUPPORT_CONTACT_CONFIGURED && !/\.(example|test)$/i.test(SUPPORT_EMAIL) && new Set(SUPPORT_PHONE.replace(/\D/g, "")).size > 2;

export default function HelpSupportScreen({ navigation }) {
  const { unreadCount = 0 } = useSupport() || {};
  const { colors } = useTheme(), styles = useThemedStyles(createStyles);
  const [openTopic, setOpenTopic] = useState(null), [error, setError] = useState("");
  const openContact = async (url) => {
    try { await Linking.openURL(url); setError(""); }
    catch { setError("Could not open this contact app. You can use support chat instead."); }
  };
  return <ScreenFrame title="Help & support" onBack={() => navigation.goBack()} footer={<Button title={unreadCount > 0 ? `Open support chat (${unreadCount})` : "Chat with support"} onPress={() => navigation.navigate("Chat")} />}>
    <View style={styles.introduction}>
      <Text style={styles.headline}>How can we help?</Text>
      <Image source={require("../../assets/artwork/support.png")} style={styles.artwork} resizeMode="contain" accessible={false} />
    </View>
    <View style={styles.topics}>
      {TOPICS.map((topic, index) => <View key={topic.title}>
        <AccountRow title={topic.title} detail={topic.detail} onPress={() => setOpenTopic(openTopic === index ? null : index)} expanded={openTopic === index}
          accessory={<Ionicons name={openTopic === index ? "chevron-up" : "chevron-forward"} size={20} color={colors.textSecondary} />} />
        {openTopic === index ? <View style={styles.answers}>{topic.answers.map(([question, answer]) => <View key={question} style={styles.answer}>
          <Text style={styles.question}>{question}</Text><Text style={styles.body}>{answer}</Text>
        </View>)}</View> : null}
      </View>)}
    </View>
    {configuredContacts ? <View style={styles.contacts}>
      <Text style={styles.sectionTitle}>Other ways to reach support</Text>
      <AccountRow title="Email" detail={SUPPORT_EMAIL} onPress={() => openContact(`mailto:${SUPPORT_EMAIL}`)} />
      <AccountRow title="Phone" detail={SUPPORT_PHONE} onPress={() => openContact(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)} />
    </View> : null}
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
  </ScreenFrame>;
}
const createStyles = ({ colors }) => ({
  introduction: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, minHeight: 80 }, headline: { ...typography.h1, color: colors.textPrimary, flex: 1 }, artwork: { width: 54, height: 80 },
  topics: { gap: 16 }, answers: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginTop: 8, gap: 20 }, answer: { gap: 8 },
  question: { ...typography.bodyMedium, color: colors.textPrimary }, body: { ...typography.bodySmall, color: colors.textSecondary },
  contacts: { marginTop: 24, gap: 16 }, sectionTitle: { ...typography.h3, color: colors.textPrimary }, error: { ...typography.bodySmall, color: colors.error, marginTop: 16 },
});
