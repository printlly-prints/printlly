import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";
import api from "../api/axios";
import { useAuth } from "./AuthContext";

const SupportContext = createContext(null);

// How often the conversation list is refetched when the socket ISN'T
// connected. Only a fallback - with a live socket the list is kept
// current by 'support:notification' and nothing here polls at all.
const FALLBACK_POLL_MS = 20 * 1000;

// Owns the admin panel's one support socket and the conversation list
// that the sidebar badge and the inbox page both read.
//
// It lives above the router rather than inside the inbox page because
// the sidebar badge has to stay live on every screen: an admin sitting
// on the Orders table should see the Support count tick up. A socket
// scoped to the inbox page could only ever show a count while the inbox
// was already open, which is the one moment it is least useful.
//
// The server joins every admin socket to the global admin:support room
// during the handshake, so notifications arrive without this asking for
// anything. Individual conversation rooms are joined only while a thread
// is actually open - see openConversation.
export function SupportProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [connected, setConnected] = useState(false);

  const socketRef = useRef(null);
  // Which thread is on screen. Held as a ref, not state, because the
  // socket handlers below close over it and would otherwise need to be
  // torn down and re-registered every time the admin clicked a different
  // conversation.
  const openCustomerRef = useRef(null);
  // Fan-out for 'support:message'. The page subscribes while it has a
  // thread open; keeping the registry here means one socket listener
  // rather than one per mount.
  const messageHandlers = useRef(new Set());

  const sortByRecent = (rows) =>
    [...rows].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));

  const refreshList = useCallback(async () => {
    if (!isAuthenticated) {
      setConversations([]);
      return;
    }
    setLoadingList(true);
    try {
      const { data } = await api.get("/admin/support/conversations");
      setConversations(sortByRecent(data));
      setListError("");
    } catch (err) {
      setListError(err.response?.data?.message || "Could not load conversations.");
    } finally {
      setLoadingList(false);
    }
  }, [isAuthenticated]);

  // --- the socket -----------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    const token = localStorage.getItem("admin_token");
    if (!token) return undefined;

    const socket = io(import.meta.env.VITE_API_BASE_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setConnected(true);
      // A reconnect means messages may have been missed while the socket
      // was down - socket.io replays nothing that was sent in the gap.
      // Re-reading the list is what closes it.
      refreshList();
      // And rejoin whatever thread is on screen, since room membership
      // does not survive a reconnect.
      if (openCustomerRef.current) {
        socket.emit("support:open", { customerId: openCustomerRef.current });
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    // Fired for EVERY conversation, open or not - that is the whole
    // point of the global room. This is what keeps a row the admin isn't
    // looking at up to date without a refresh.
    socket.on("support:notification", (payload) => {
      const customerId = String(payload.customerId);

      setConversations((current) => {
        const index = current.findIndex((c) => String(c.customer?._id) === customerId);

        // A customer writing in for the very first time has no row yet.
        // The notification is deliberately lightweight (no name, no
        // phone), so there is nothing to build a row out of - refetch
        // instead of inventing a half-populated one.
        if (index === -1) {
          refreshList();
          return current;
        }

        const row = current[index];
        const next = [...current];
        next[index] = {
          ...row,
          last_message: {
            text: payload.preview,
            sender_role: payload.sender_role,
            created_at: payload.last_message_at,
          },
          last_message_at: payload.last_message_at,
          // Assigned from the server's count rather than incremented
          // locally: two admins on the same inbox would otherwise drift.
          // Forced to 0 for the thread currently on screen, which is
          // being read as it arrives (the page marks it read too - this
          // just stops the badge flickering up and back down).
          unread_by_admin: customerId === openCustomerRef.current ? 0 : payload.unread_by_admin ?? 0,
        };
        return sortByRecent(next);
      });
    });

    socket.on("support:message", (message) => {
      for (const handler of messageHandlers.current) handler(message);
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, refreshList]);

  // One load at sign-in, so the badge is right before the inbox is ever
  // opened.
  useEffect(() => {
    if (isAuthenticated) refreshList();
  }, [isAuthenticated, refreshList]);

  // Fallback polling, and ONLY as a fallback: while the socket is up the
  // list is already live, and polling it as well would be pure waste.
  useEffect(() => {
    if (!isAuthenticated || connected) return undefined;
    const interval = setInterval(refreshList, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, connected, refreshList]);

  // --- room membership --------------------------------------------------
  // Joining is what makes live delivery work for the open thread; leaving
  // is what stops an admin who has clicked through ten conversations from
  // receiving messages for all ten.
  const openConversation = useCallback((customerId) => {
    openCustomerRef.current = String(customerId);
    socketRef.current?.emit("support:open", { customerId });
  }, []);

  const closeConversation = useCallback((customerId) => {
    if (openCustomerRef.current === String(customerId)) openCustomerRef.current = null;
    socketRef.current?.emit("support:close", { customerId });
  }, []);

  const subscribeToMessages = useCallback((handler) => {
    messageHandlers.current.add(handler);
    return () => messageHandlers.current.delete(handler);
  }, []);

  // --- actions ----------------------------------------------------------
  const markRead = useCallback(async (customerId) => {
    // Locally first: the admin is looking at the thread, so zero is the
    // truthful state on screen whether or not the write lands.
    setConversations((current) =>
      current.map((c) =>
        String(c.customer?._id) === String(customerId) ? { ...c, unread_by_admin: 0 } : c
      )
    );

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("support:mark_read", { customerId });
      return;
    }
    try {
      await api.patch(`/admin/support/conversations/${customerId}/read`);
    } catch {
      // Not rolled back - see above. The next refresh re-reads whatever
      // the server actually has.
    }
  }, []);

  // Socket first, REST as the fallback. Both reach the same backend
  // function, so the only difference is whether the customer sees it
  // immediately or on their next fetch.
  const sendMessage = useCallback(async (customerId, text) => {
    const body = String(text || "").trim();
    if (!body) return { ok: false, message: "Message is empty" };

    const socket = socketRef.current;
    if (socket?.connected) {
      const ack = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 6000);
        socket.emit("support:send", { customerId, text: body }, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
      });

      if (ack?.ok) return { ok: true };
      // A refusal is the server's answer, not a transport problem -
      // resending over REST would collect the same refusal.
      if (ack && ack.ok === false) return { ok: false, message: ack.message };

      // No ack at all. Deliberately not retried over REST: socket.io
      // replays an emit made on a dying connection once it reconnects, so
      // a second send here would post the reply twice - and the customer
      // would see it twice.
      return { ok: false, message: "That didn't go through - check the thread before resending." };
    }

    try {
      const { data } = await api.post(`/admin/support/conversations/${customerId}/messages`, {
        text: body,
      });
      // Returned so the caller can place it in the thread itself: with no
      // socket there is no broadcast coming back to do it.
      return { ok: true, message: data };
    } catch (err) {
      return {
        ok: false,
        message: err.response?.data?.message || "Couldn't send. Check your connection.",
      };
    }
  }, []);

  const unreadTotal = useMemo(
    () => conversations.reduce((total, c) => total + (c.unread_by_admin || 0), 0),
    [conversations]
  );

  // Number of THREADS waiting, not messages. The sidebar badge uses this:
  // "4" meaning four people are waiting is a more actionable number than
  // "4" meaning one person sent four lines.
  const unreadThreads = useMemo(
    () => conversations.filter((c) => (c.unread_by_admin || 0) > 0).length,
    [conversations]
  );

  const value = useMemo(
    () => ({
      conversations,
      loadingList,
      listError,
      connected,
      unreadTotal,
      unreadThreads,
      refreshList,
      openConversation,
      closeConversation,
      subscribeToMessages,
      sendMessage,
      markRead,
    }),
    [
      conversations,
      loadingList,
      listError,
      connected,
      unreadTotal,
      unreadThreads,
      refreshList,
      openConversation,
      closeConversation,
      subscribeToMessages,
      sendMessage,
      markRead,
    ]
  );

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export const useSupport = () => useContext(SupportContext);
