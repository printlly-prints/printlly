import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const SupportContext = createContext(null);

// ONE socket for the whole app, owned here rather than by ChatScreen.
//
// Two reasons it can't live in the screen. The unread dot on Profile's
// "Help & Support" row has to move when an admin replies while the
// customer is somewhere else entirely - if the socket only existed while
// the chat was open, the dot could only ever update by polling. And
// connecting per screen visit would mean a fresh handshake every time
// the customer backs out and returns, which is both slower and more
// work for the server than keeping one connection.
//
// The server decides what this socket can see: a customer socket is
// joined to its OWN thread room during the handshake, from the id inside
// its own token (see config/socket.js on the backend). Nothing here asks
// to join anything, and nothing it could ask for would widen that.
export function SupportProvider({ children }) {
  const { isAuthenticated, token } = useAuth();

  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [oldestAt, setOldestAt] = useState(null);

  const socketRef = useRef(null);
  const appState = useRef(AppState.currentState);

  // A message can arrive twice: once over the socket and once in a
  // history fetch that raced it. Deduped by _id, and kept in send order
  // so a slow arrival can't jump the thread.
  const mergeMessages = useCallback((existing, incoming) => {
    const byId = new Map(existing.map((m) => [String(m._id), m]));
    for (const message of incoming) byId.set(String(message._id), message);
    return [...byId.values()].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, []);

  // GET /support/conversation get-or-creates, so this is also what
  // brings a first-time customer's thread into existence - there is no
  // separate "start a conversation" call.
  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setMessages([]);
      setUnreadCount(0);
      setLoaded(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/support/conversation");
      setMessages(data.messages || []);
      setUnreadCount(data.conversation?.unread_by_customer || 0);
      setHasMore(Boolean(data.has_more));
      setOldestAt(data.oldest_created_at || null);
      setLoaded(true);
    } catch {
      // Leave whatever is cached. A failed refresh shouldn't blank the
      // thread or drop the unread dot - both are better slightly stale
      // than gone.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Older pages, for "Load earlier messages". Keyed on the oldest
  // message's timestamp rather than an offset, matching the backend -
  // with an offset, a message arriving between two page loads shifts
  // everything down one and the reader sees a duplicate.
  const loadOlder = useCallback(async () => {
    if (!hasMore || !oldestAt) return;
    try {
      const { data } = await api.get("/support/conversation", { params: { before: oldestAt } });
      setMessages((current) => mergeMessages(current, data.messages || []));
      setHasMore(Boolean(data.has_more));
      setOldestAt(data.oldest_created_at || null);
    } catch {
      // Same reasoning as refresh: keep what is on screen.
    }
  }, [hasMore, oldestAt, mergeMessages]);

  // --- the socket ---------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      // AuthContext holds the token in state, but on a cold start the
      // socket can be set up in the same tick the session is restored -
      // so fall back to storage, which is the same place the axios
      // interceptor reads from.
      const authToken = token || (await AsyncStorage.getItem("token"));
      if (!authToken || cancelled) return;

      const socket = io(process.env.EXPO_PUBLIC_API_BASE_URL, {
        auth: { token: authToken },
        // React Native has no long-polling advantage to fall back to and
        // the extra upgrade round-trip just delays the first message.
        transports: ["websocket"],
      });

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => setConnected(false));

      socket.on("support:message", (message) => {
        setMessages((current) => mergeMessages(current, [message]));
        // Only an ADMIN's message is unread - the customer's own message
        // comes back over the same room (one rendering path for both
        // sides), and counting it would light the dot for something they
        // just typed themselves.
        if (message.sender_role === "admin") {
          setUnreadCount((count) => count + 1);
        }
      });

      socketRef.current = socket;
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, token, mergeMessages]);

  // The socket dies quietly when the OS suspends the app, and whatever
  // arrived meanwhile was never delivered. Re-fetching on foreground is
  // what closes that gap; socket.io reconnects on its own, but only
  // carries messages sent AFTER it is back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        refresh();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [refresh]);

  // One fetch at login, so the unread dot is right before the customer
  // ever opens the support screen.
  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  // --- sending --------------------------------------------------------
  // Socket first, REST as the fallback. Both end up in the same backend
  // function, so what actually differs is only whether the message has
  // to wait for a reconnect - and a customer writing to support is
  // usually a customer whose day is already going badly.
  const sendMessage = useCallback(
    async (text, orderContext) => {
      const body = String(text || "").trim();
      if (!body) return { ok: false, message: "Message is empty" };

      const socket = socketRef.current;
      if (socket?.connected) {
        const ack = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), 6000);
          socket.emit("support:send", { text: body, order_context: orderContext }, (response) => {
            clearTimeout(timer);
            resolve(response);
          });
        });

        if (ack?.ok) return { ok: true };
        // A refusal (too long, an order that isn't theirs) is the
        // server's answer, not a transport failure - retrying it over
        // REST would only collect the same refusal.
        if (ack && ack.ok === false) return { ok: false, message: ack.message };

        // No ack at all. Deliberately NOT retried over REST: socket.io
        // buffers an emit made on a connection that drops and replays it
        // on reconnect, so a second send here would post the same
        // message twice - and a duplicate in a support thread is worse
        // than a retry the customer chooses themselves. Re-read the
        // thread so that if it did land, they can see it did.
        await refresh();
        return {
          ok: false,
          message: "That's taking longer than usual - check the thread above before resending.",
        };
      }

      try {
        const { data } = await api.post("/support/conversation/messages", {
          text: body,
          order_context: orderContext,
        });
        // No broadcast reaches this client when it has no socket, so the
        // message has to be placed into the thread here. Over the socket
        // path it arrives through 'support:message' instead, which is
        // why this isn't done unconditionally.
        setMessages((current) => mergeMessages(current, [data]));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error?.response?.data?.message || "Couldn't send. Check your connection.",
        };
      }
    },
    [mergeMessages, refresh]
  );

  // Clears the dot. Optimistic, and not rolled back on failure: the
  // customer IS looking at the thread, so zero is the truthful state
  // locally even if the write didn't land - and the next refresh will
  // re-read whatever the server actually has.
  const markRead = useCallback(async () => {
    setUnreadCount(0);
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("support:mark_read", {});
      return;
    }
    try {
      await api.patch("/support/conversation/read");
    } catch {
      /* see above */
    }
  }, []);

  const value = useMemo(
    () => ({
      messages,
      unreadCount,
      loading,
      loaded,
      connected,
      hasMore,
      refresh,
      loadOlder,
      sendMessage,
      markRead,
    }),
    [messages, unreadCount, loading, loaded, connected, hasMore, refresh, loadOlder, sendMessage, markRead]
  );

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

// Returns null outside the provider rather than throwing, matching the
// other contexts here. Every real consumer sits inside SupportProvider
// (it wraps the navigator in App.js), but the two that only read the
// unread count - ProfileScreen and HelpSupportScreen - guard with
// `|| {}` anyway, since a missing chat should never be what takes the
// Profile tab down.
export const useSupport = () => useContext(SupportContext);
