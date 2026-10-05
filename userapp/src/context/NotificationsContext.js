import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const NotificationsContext = createContext(null);

// Fetches GET /notifications on app load and again whenever the app
// returns to the foreground, so the Profile tab's unread badge and the
// Notifications screen both read from one shared cache instead of each
// polling on its own.
export function NotificationsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data);
    } catch {
      // Leave whatever was already cached - a failed refresh shouldn't
      // blank out the badge or the list.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        load();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [load]);

  // Marks one notification read immediately (no-op if already read or
  // unknown), reverting if the PATCH fails.
  const markRead = useCallback(
    async (id) => {
      const previous = notifications;
      const target = previous.find((n) => n._id === id);
      if (!target || target.read) return;

      setNotifications(previous.map((n) => (n._id === id ? { ...n, read: true } : n)));
      try {
        await api.patch(`/notifications/${id}/read`);
      } catch {
        setNotifications(previous);
      }
    },
    [notifications]
  );

  const markAllRead = useCallback(async () => {
    const previous = notifications;
    if (previous.every((n) => n.read)) return;

    setNotifications(previous.map((n) => ({ ...n, read: true })));
    try {
      await api.patch("/notifications/read-all");
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

  // Recomputed only when the list actually changes, rather than counting
  // the whole array on every render of the provider.
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // Memoized for the same reason as the other two providers - this one
  // wraps the entire authenticated app (see App.js), and its unread badge
  // sits on the tab bar, so an unstable value here re-rendered every
  // screen on any notification state change.
  const value = useMemo(
    () => ({ notifications, loading, unreadCount, refresh: load, markRead, markAllRead }),
    [notifications, loading, unreadCount, load, markRead, markAllRead]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export const useNotifications = () => useContext(NotificationsContext);
