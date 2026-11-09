import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../components/Button";
import { useSupport } from "../context/SupportContext";
import {
  SUPPORT_EMAIL,
  SUPPORT_HOURS,
  SUPPORT_PHONE,
  SUPPORT_CONTACT_CONFIGURED,
} from "../config/support";
import { colors, typography, spacing, radius } from "../theme";

// Every answer below describes what this app and backend ACTUALLY do -
// document deletion on completion, the 6-digit pickup OTP, per-shop
// vendor-set pricing, the two expiry windows, and the fact that there is
// no self-serve cancellation. Nothing here is aspirational: a FAQ that
// describes a product that doesn't exist yet generates more support
// tickets than it deflects, which is the opposite of the point.
const FAQS = [
  {
    q: "What happens to my documents after printing?",
    a: "They're deleted when your order is completed or expires. We never share or sell them.",
  },
  {
    q: "How does pickup work?",
    a: "After payment you get a 6-digit pickup code. When your prints are ready, read it out at the shop. Keep it private until then.",
  },
  {
    q: "Why does the same document cost different amounts at different shops?",
    a: "Each shop sets its own prices, and Paprout adds a platform fee. The totals you compare are for your exact order.",
  },
  {
    q: "I asked for a service and a shop didn't show up",
    a: "Not every shop offers every service, so shops that can't do what you asked for are left out.",
  },
  {
    q: "My order says expired - what happened?",
    a: "Unpaid orders expire after about an hour. Orders with no progress expire after 48 hours. Orders ready for pickup don't expire. You'll need to upload your files again.",
  },
  {
    q: "My payment failed but money left my account",
    a: "It's refunded automatically, usually within a few working days. You can retry from the order screen. If it doesn't come back, chat with us below.",
  },
  {
    q: "Can I cancel or change an order after paying?",
    a: "Not in the app yet. Message us as soon as you can and we'll check with the shop.",
  },
  {
    q: "A shop is showing as closed",
    a: "Shops set their own hours and can close at any time. You can order once it reopens, or pick another shop.",
  },
];

export default function HelpSupportScreen({ navigation }) {
  const { unreadCount } = useSupport() || {};
  const [openIndex, setOpenIndex] = useState(null);

  // Best-effort: a device with no mail client or no dialer (a tablet,
  // a simulator) simply does nothing rather than throwing. The address
  // and number are on screen as selectable text either way, which is
  // what actually matters.
  const openLink = (url) => Linking.openURL(url).catch(() => {});

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Chat sits at the top, not below eight FAQ answers: someone who
          opened this screen with a real problem shouldn't have to scroll
          past general reading to reach a person. */}
      <View style={styles.chatCard}>
        <View style={styles.chatHeader}>
          <View style={styles.chatIcon}>
            <Ionicons
              name="chatbubbles"
              size={20}
              color={colors.primaryBright}
            />
          </View>
          <View style={styles.chatHeaderText}>
            <Text style={styles.chatTitle}>Chat with support</Text>
            <Text style={styles.chatSubtitle}>
              {unreadCount > 0
                ? `You have ${unreadCount} new repl${unreadCount === 1 ? "y" : "ies"}`
                : "Talk to the Paprout team about an order, a payment or a shop"}
            </Text>
          </View>
        </View>
        <Button
          title={unreadCount > 0 ? "Open chat" : "Start a chat"}
          onPress={() => navigation.navigate("Chat")}
        />
      </View>

      <Text style={styles.sectionTitle}>Common questions</Text>
      <View style={styles.faqBox}>
        {FAQS.map((faq, i) => {
          const open = openIndex === i;
          return (
            <View
              key={faq.q}
              style={[styles.faqItem, i > 0 && styles.faqItemBorder]}
            >
              <Pressable
                style={styles.faqQuestionRow}
                onPress={() => setOpenIndex(open ? null : i)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={styles.faqQuestion}>{faq.q}</Text>
                <Ionicons
                  name={open ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
              {open ? <Text style={styles.faqAnswer}>{faq.a}</Text> : null}
            </View>
          );
        })}
      </View>

      {SUPPORT_CONTACT_CONFIGURED ? (
        <>
          <Text style={styles.sectionTitle}>Other ways to reach us</Text>
          <View style={styles.contactBox}>
            <ContactRow
              icon="mail-outline"
              label="Email"
              value={SUPPORT_EMAIL}
              onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
            />
            <ContactRow
              icon="call-outline"
              label="Phone"
              value={SUPPORT_PHONE}
              note={SUPPORT_HOURS}
              onPress={() =>
                openLink(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)
              }
              border
            />
          </View>
        </>
      ) : null}

      <Text style={styles.footnote}>
        Chat is fastest for order questions.
      </Text>
    </ScrollView>
  );
}

function ContactRow({ icon, label, value, note, onPress, border }) {
  return (
    <Pressable
      style={[styles.contactRow, border && styles.contactRowBorder]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <View style={styles.contactText}>
        <Text style={styles.contactLabel}>{label}</Text>
        {/* Selectable so it can be copied on a device with no mail app
            or dialer, where tapping does nothing. */}
        <Text style={styles.contactValue} selectable>
          {value}
        </Text>
        {note ? <Text style={styles.contactNote}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  chatCard: {
    backgroundColor: colors.primaryWash,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderText: { flex: 1 },
  chatTitle: { ...typography.h3, color: colors.textPrimary },
  chatSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },

  sectionTitle: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  faqBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  faqItem: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  faqItemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  faqQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  faqQuestion: { ...typography.bodyMedium, color: colors.textPrimary, flex: 1 },
  faqAnswer: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  contactBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  placeholderNote: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    paddingTop: spacing.md,
  },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  contactRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  contactText: { flex: 1 },
  contactLabel: { ...typography.caption, color: colors.textMuted },
  contactValue: { ...typography.bodyMedium, color: colors.textPrimary },
  contactNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
