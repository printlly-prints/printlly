import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import ScreenFrame from "../components/ScreenFrame";
import Avatar from "../components/Avatar";
import Button from "../components/Button";
import { useSupport } from "../context/SupportContext";
import { useTheme, useThemedStyles } from "../context/ThemeContext";
import { typography, radius, fonts } from "../theme";

// Existing SupportContext owns authentication, socket deduplication and REST fallback.
export default function ChatScreen({ route, navigation }) {
  const { messages, loading, loaded, connected, hasMore, unreadCount, refresh, loadOlder, sendMessage, markRead } = useSupport();
  const { colors, reducedMotion } = useTheme(), styles = useThemedStyles(createStyles);
  const isFocused = useIsFocused();
  const [draft, setDraft] = useState(route.params?.draft || ""), [sending, setSending] = useState(false), [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const listRef = useRef(null), sendingRef = useRef(false), nearBottom = useRef(true), loadingOlderRef = useRef(false);
  const pendingContext = useRef(route.params?.orderContext || null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    pendingContext.current = route.params?.orderContext || null;
    if (route.params?.draft) setDraft((current) => current || route.params.draft);
  }, [route.params?.orderContext, route.params?.draft]);
  useEffect(() => { if (isFocused && unreadCount > 0) markRead(); }, [isFocused, unreadCount, messages.length, markRead]);
  // When the socket is down, entering the thread reconciles the cached page.
  useEffect(() => { if (isFocused && !connected) refresh(); }, [isFocused, connected, refresh]);
  const onSend = async () => {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true; setSending(true); setError("");
    try {
      const result = await sendMessage(text, pendingContext.current || undefined);
      if (!mounted.current) return;
      if (result.ok) {
        pendingContext.current = null; setDraft(""); nearBottom.current = true;
        // Wait for the posted message to join the rendered list before
        // scrolling; history anchoring otherwise restores the old position.
        requestAnimationFrame(() => { if (mounted.current) listRef.current?.scrollToEnd({ animated: !reducedMotion }); });
      }
      else setError(result.message || "Could not send your message. Try again.");
    } catch { if (mounted.current) setError("Could not send your message. Check your connection."); }
    finally { sendingRef.current = false; if (mounted.current) setSending(false); }
  };
  const earlier = async () => {
    if (loadingOlderRef.current) return;
    loadingOlderRef.current = true; setLoadingOlder(true);
    try { await loadOlder(); } finally {
      if (mounted.current) setLoadingOlder(false);
      requestAnimationFrame(() => { loadingOlderRef.current = false; });
    }
  };
  const composer = <View>
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    <View style={styles.composer}>
      <TextInput accessibilityLabel="Message support" style={styles.input} value={draft} onChangeText={setDraft} editable={!sending} placeholder="Message support" placeholderTextColor={colors.textMuted}
        multiline maxLength={2000} textAlignVertical="top" autoCapitalize="sentences" />
      <Pressable onPress={onSend} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send message" accessibilityState={{ disabled: !draft.trim() || sending, busy: sending }}
        style={({ pressed }) => [styles.send, (!draft.trim() || sending) && styles.sendDisabled, pressed && styles.sendPressed]}>
        {sending ? <ActivityIndicator color={colors.onAction} size="small" /> : <Ionicons name="send-outline" size={22} color={colors.onAction} />}
      </Pressable>
    </View>
  </View>;
  return <ScreenFrame title="Printlly support" onBack={() => navigation.goBack()} scroll={false} contentStyle={styles.frameContent} footer={composer}>
    {!connected && loaded ? <View style={styles.connection}><Text style={styles.connectionText}>Reconnecting. Replies may be delayed.</Text><Button title="Refresh conversation" variant="text" onPress={refresh} /></View> : null}
    {loading && !messages.length ? <View style={styles.center}><ActivityIndicator color={colors.action} /><Text style={styles.emptyBody}>Loading your conversation…</Text></View> :
      <FlatList ref={listRef} style={styles.list} data={messages} keyExtractor={(item) => String(item._id)} contentContainerStyle={[styles.listContent, !messages.length && styles.emptyList]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={<View style={styles.threadHeader}>
          <View style={styles.identity}><Avatar avatarId="05-support" size={48} decorative /><View style={{ flex: 1 }}><Text style={styles.identityTitle}>Printlly team</Text><Text style={styles.emptyBody}>Help with your orders, payments and files.</Text></View></View>
          {hasMore ? <Button title="Load earlier messages" variant="text" loading={loadingOlder} onPress={earlier} /> : null}
        </View>}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{loaded ? "How can we help?" : "Conversation unavailable"}</Text><Text style={styles.emptyBody}>{loaded ? "Send a message to the Printlly team. Replies appear here." : "Check your connection and try again."}</Text>{!loaded ? <Button title="Try again" variant="secondary" onPress={refresh} /> : null}</View>}
        renderItem={({ item }) => <Bubble message={item} />}
        onScroll={({ nativeEvent }) => { nearBottom.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 100; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (messages.length && nearBottom.current && !loadingOlderRef.current) listRef.current?.scrollToEnd({ animated: !reducedMotion }); }}
      />}
  </ScreenFrame>;
}
function Bubble({ message }) {
  const styles = useThemedStyles(createStyles), mine = message.sender_role === "customer";
  const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return <View style={[styles.bubble, mine ? styles.outgoing : styles.incoming]}>
    {message.order_context?.order_id ? <Text style={[styles.context, mine && styles.outgoingText]}>{message.order_context.shop_name || "Order"} · {String(message.order_context.order_id).slice(-6).toUpperCase()}</Text> : null}
    <Text style={[styles.message, mine && styles.outgoingText]} selectable>{message.text}</Text>
    <Text style={[styles.time, mine && styles.outgoingText]}>{time}</Text>
  </View>;
}
const createStyles = ({ colors }) => ({
  frameContent: { padding: 0 }, list: { flex: 1 }, listContent: { padding: 24, gap: 16 }, emptyList: { flexGrow: 1 }, threadHeader: { gap: 16, marginBottom: 4 },
  identity: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 60 }, identityTitle: { ...typography.bodyMedium, color: colors.textPrimary },
  connection: { backgroundColor: colors.infoSurface, paddingHorizontal: 24, paddingTop: 8 }, connectionText: { ...typography.caption, color: colors.textPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, empty: { flex: 1, gap: 12, paddingVertical: 24 }, emptyTitle: { ...typography.h3, color: colors.textPrimary }, emptyBody: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
  bubble: { width: "100%", borderRadius: radius.md, padding: 16, gap: 8 }, incoming: { backgroundColor: colors.chatIncoming }, outgoing: { backgroundColor: colors.chatOutgoing },
  message: { ...typography.body, color: colors.textPrimary }, outgoingText: { color: colors.onAction }, time: { ...typography.caption, color: colors.textSecondary, textAlign: "right" }, context: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error, marginBottom: 8 }, composer: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  input: { flex: 1, minHeight: 48, maxHeight: 144, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radius.button, padding: 12, fontFamily: fonts.bodyRegular, fontSize: 14, lineHeight: 20, backgroundColor: colors.surface, color: colors.textPrimary },
  send: { minWidth: 48, minHeight: 48, backgroundColor: colors.action, borderRadius: radius.button, alignItems: "center", justifyContent: "center" }, sendDisabled: { backgroundColor: colors.actionDisabled }, sendPressed: { backgroundColor: colors.actionPressed },
});
