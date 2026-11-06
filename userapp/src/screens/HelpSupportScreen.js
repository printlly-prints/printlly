import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
    a:
      "They are deleted automatically. The moment the shop marks your order completed - by entering your pickup OTP - the file is removed from our servers and from our storage provider. The same thing happens if an order expires without being collected. Your documents are only ever used to fulfil the order you uploaded them for; they are never shared or sold.",
  },
  {
    q: "How does pickup work?",
    a:
      "Once your payment is confirmed you get a 6-digit OTP, shown on the order screen. When your prints are ready, go to the shop and read out that OTP - the shop enters it to confirm you collected the right order. Only then is the order marked completed. Don't share the OTP with anyone before you're at the counter: it's the only thing proving the prints are yours.",
  },
  {
    q: "Why does the same document cost different amounts at different shops?",
    a:
      "Because each shop sets its own prices. A shop chooses its own per-page rate for black & white and for colour, what it charges for A3, its surcharge for double-sided, and which add-on services it offers and at what price. Paprout adds a platform fee on top, and that part is the same everywhere. The shop-selection screen prices your exact documents at every nearby shop, so the totals you compare there are the real ones.",
  },
  {
    q: "I asked for a service and a shop didn't show up",
    a:
      "Add-on services like binding or lamination are set up by each shop individually, so not every shop offers every service - and a shop that can't do what you asked for is left out of the comparison rather than shown at a price it can't honour. Shops also name things differently: one shop's \"Lamination\" may be another's \"Glossy Lamination\". We match loosely when comparing, and the shop's own name and price are what you see on the review screen and on the final order.",
  },
  {
    q: "My order says expired - what happened?",
    a:
      "Orders expire in two situations. If a payment is never completed, the order is released after about an hour. And if an order stalls - still waiting on the shop to accept it, or accepted but never moved on - it is closed out after 48 hours without progress. Once your prints are marked ready for pickup that clock stops, so a ready order won't expire out from under you. In either case the uploaded documents are deleted along with the order, so you'll need to upload again to place a new one.",
  },
  {
    q: "My payment failed but money left my account",
    a:
      "If a payment doesn't verify, Razorpay releases the amount back to the original payment method automatically - bank timelines vary, but it is usually a few working days. The order itself stays payable in the meantime, so you can simply try again from the order screen. If you've waited and nothing has come back, start a chat below with the order open and we'll trace it.",
  },
  {
    q: "Can I cancel or change an order after paying?",
    a:
      "Not from the app - there's no self-serve cancellation yet, mainly because your file may already be printing. Message us here as early as you can and we'll sort it out with the shop directly.",
  },
  {
    q: "A shop is showing as closed",
    a:
      "Shops set their own opening hours, and can also close manually when they're mid-rush or out of paper. A closed shop still appears in the list - it just can't take a new order until it reopens. If it looks wrong, pick another shop for now and tell us which one, and we'll check with the owner.",
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
            <Ionicons name="chatbubbles" size={20} color={colors.primaryBright} />
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
        <Button title={unreadCount > 0 ? "Open chat" : "Start a chat"} onPress={() => navigation.navigate("Chat")} />
      </View>

      <Text style={styles.sectionTitle}>Common questions</Text>
      <View style={styles.faqBox}>
        {FAQS.map((faq, i) => {
          const open = openIndex === i;
          return (
            <View key={faq.q} style={[styles.faqItem, i > 0 && styles.faqItemBorder]}>
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

      <Text style={styles.sectionTitle}>Other ways to reach us</Text>
      <View style={styles.contactBox}>
        {!SUPPORT_CONTACT_CONFIGURED ? (
          // Stated rather than hidden. An invented email that looks real
          // is worse than an obvious placeholder: a customer writes to it
          // and hears nothing back.
          <View style={styles.placeholderNote}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>
              Placeholder details - set EXPO_PUBLIC_SUPPORT_EMAIL and EXPO_PUBLIC_SUPPORT_PHONE in
              userapp/.env before release.
            </Text>
          </View>
        ) : null}

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
          onPress={() => openLink(`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`)}
          border
        />
      </View>

      <Text style={styles.footnote}>
        Chat is the fastest route for anything about a specific order - it comes through with your
        order details already attached.
      </Text>
    </ScrollView>
  );
}

function ContactRow({ icon, label, value, note, onPress, border }) {
  return (
    <Pressable style={[styles.contactRow, border && styles.contactRowBorder]} onPress={onPress}>
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
  chatSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },

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
  faqQuestionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  faqQuestion: { ...typography.bodyMedium, color: colors.textPrimary, flex: 1 },
  faqAnswer: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm },

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
  placeholderText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
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
  contactNote: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
