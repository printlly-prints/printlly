import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import { useSupport } from "../context/SupportContext";
import { colors, typography, spacing, radius, fonts } from "../theme";

// Live chat with platform support.
//
// The socket itself belongs to SupportContext, not to this screen (see
// its comment): the unread dot on Profile has to keep moving while the
// customer is anywhere else in the app, which a per-screen connection
// can't do. This screen just reads the thread and sends.
//
// Reached two ways: from Help & Support, and from an order's "Need help
// with this order?" button, which arrives with route.params.orderContext
// and a pre-filled opening line.
export default function ChatScreen({ route }) {
  const orderContext = route.params?.orderContext || null;
  const { messages, loading, loaded, connected, hasMore, refresh, loadOlder, sendMessage, markRead } =
    useSupport();

  const isFocused = useIsFocused();
  const [draft, setDraft] = useState(route.params?.draft || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);

  // The order reference is attached to the FIRST message sent from this
  // entry point and then dropped. Stamping every later message in the
  // conversation with the same order would be noise in the admin's view -
  // the thread has already been established as being about that order.
  const pendingContext = useRef(orderContext);

  // Reading the thread is what clears the dot. Keyed on focus AND on the
  // message count, not just on mount: this screen stays in the stack, so
  // it has to clear again when the customer comes back to it - and a
  // reply that lands while they are already sitting here is read the
  // moment it appears, not the next time they navigate away and return.
  useEffect(() => {
    if (isFocused) markRead();
  }, [isFocused, messages.length, markRead]);

  // A thread already loaded once at login isn't re-fetched here - the
  // socket has been keeping it current since. This is for the cold case
  // where that first fetch failed or hadn't happened yet.
  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    // Cleared up front so the input is ready for the next line straight
    // away; restored below if the send is refused, so nothing typed is
    // ever silently lost.
    setDraft("");
    const context = pendingContext.current;
    const result = await sendMessage(text, context || undefined);
    setSending(false);

    if (result.ok) {
      pendingContext.current = null;
    } else {
      setDraft(text);
      setError(result.message || "Couldn't send that message.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // Clears the native stack header, which KeyboardAvoidingView does
      // not account for on iOS.
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      {/* Shown only when the live connection is actually down, and
          worded as a delay rather than a failure - messages still send
          over REST in this state, they just don't arrive instantly. */}
      {!connected && loaded ? (
        <View style={styles.offlineBar}>
          <Text style={styles.offlineText}>Reconnecting - replies may take a moment to appear</Text>
        </View>
      ) : null}

      {loading && !messages.length ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryBright} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item._id)}
          contentContainerStyle={[styles.list, !messages.length && styles.listEmpty]}
          renderItem={({ item }) => <Bubble message={item} />}
          ListHeaderComponent={
            hasMore ? (
              <Pressable style={styles.loadOlder} onPress={loadOlder}>
                <Text style={styles.loadOlderText}>Load earlier messages</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyBody}>
                Tell us what's going on and someone from the Printlly team will reply here.
              </Text>
            </View>
          }
          // Newest sits at the bottom, so the end is where the thread
          // is. Driven off content size rather than off the message
          // count: it also fires when the keyboard opens or a long
          // bubble wraps, both of which would otherwise push the latest
          // message out of view - and a reply nobody sees reads as no
          // reply at all.
          onContentSizeChange={() => messages.length && listRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type your message"
          placeholderTextColor={colors.textMuted}
          multiline
          // The server refuses anything longer, so stopping it here means
          // a rejection the customer can see coming rather than one that
          // arrives after they press send.
          maxLength={2000}
        />
        <Pressable
          onPress={onSend}
          disabled={!draft.trim() || sending}
          style={({ pressed }) => [
            styles.send,
            (!draft.trim() || sending) && styles.sendDisabled,
            pressed && draft.trim() && !sending && styles.sendPressed,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Ionicons name="send" size={18} color={colors.surface} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// One message. Side and colour both carry the sender - side alone is a
// weak signal on a narrow screen when a bubble happens to be wide.
function Bubble({ message }) {
  const mine = message.sender_role === "customer";
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {/* The order this message was sent about, resolved server-side
            from the order itself. Shown to the customer too, not just to
            the admin, so it's clear what the support agent is looking at. */}
        {message.order_context?.order_id ? (
          <View style={[styles.contextChip, mine && styles.contextChipMine]}>
            <Ionicons
              name="receipt-outline"
              size={12}
              color={mine ? colors.primaryWash : colors.textSecondary}
            />
            <Text style={[styles.contextText, mine && styles.contextTextMine]} numberOfLines={1}>
              {message.order_context.shop_name || "Order"} ·{" "}
              {String(message.order_context.order_id).slice(-6).toUpperCase()}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
        <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  offlineBar: {
    backgroundColor: colors.backgroundSoft,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  offlineText: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },

  list: { padding: spacing.lg, paddingBottom: spacing.md },
  listEmpty: { flexGrow: 1, justifyContent: "center" },

  empty: { alignItems: "center", paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md },
  emptyBody: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },

  loadOlder: { alignSelf: "center", paddingVertical: spacing.sm, marginBottom: spacing.sm },
  loadOlderText: { ...typography.labelSmall, color: colors.primaryBright },

  bubbleRow: { flexDirection: "row", marginBottom: spacing.sm },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    // Square off the corner nearest the sender's side, so the tail of
    // the thread reads as a direction rather than a stack of pills.
    borderBottomRightRadius: radius.sm - 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm - 6,
  },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: colors.surface },
  bubbleTime: { ...typography.caption, color: colors.textMuted, marginTop: 4, alignSelf: "flex-end" },
  bubbleTimeMine: { color: colors.primaryWash },

  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.backgroundSoft,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  contextChipMine: { backgroundColor: colors.primaryDeep },
  contextText: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  contextTextMine: { color: colors.primaryWash },

  error: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    fontFamily: fonts.bodyRegular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendPressed: { backgroundColor: colors.primaryDeep },
  sendDisabled: { opacity: 0.45 },
});
