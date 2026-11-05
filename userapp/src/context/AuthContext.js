import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Imported lazily inside logout rather than at module scope:
// OrderEventsContext imports useAuth from here, so a top-level import
// would be a require cycle.
import api, { onAuthenticatedRequestExpired } from "../api/client";
import { identifyUser, clearUser } from "../lib/analytics";

const AuthContext = createContext(null);

// Holds the logged-in customer and their JWT. Both are persisted to
// AsyncStorage so closing and reopening the app keeps you signed in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while reading storage on launch
  const [sessionExpired, setSessionExpired] = useState(false);
  const sessionRef = useRef({ user, token });
  const storageQueue = useRef(Promise.resolve());
  const queueStorage = useCallback((operation) => {
    const result = storageQueue.current.then(operation, operation);
    storageQueue.current = result.catch(() => {});
    return result;
  }, []);
  sessionRef.current = { user, token };
  useEffect(() => onAuthenticatedRequestExpired(authorization => {
    if (sessionRef.current.token && authorization === `Bearer ${sessionRef.current.token}`) setSessionExpired(true);
  }), []);

  // Restore a previous session on app start.
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem("token"),
          AsyncStorage.getItem("user"),
        ]);
        if (storedToken) setToken(storedToken);
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUser(parsed);
          // A relaunch restores the session without going through
          // persistSession, so without this the identity would be missing on
          // every launch after the first - which is most of them.
          identifyUser(parsed);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // These three are wrapped in useCallback purely so the context value
  // below can be memoized meaningfully: a useMemo whose dependencies are
  // freshly-created function identities would be recomputed on every
  // render anyway, which is no memoization at all.
  const persistSession = useCallback(async (data) => {
    await queueStorage(async () => {
      await AsyncStorage.setItem("token", data.token);
      await AsyncStorage.setItem("user", JSON.stringify(data.user));
    });
    sessionRef.current = { token: data.token, user: data.user };
    setToken(data.token);
    setUser(data.user);
    setSessionExpired(false);
    // Id and role only - never the customer's name, email or phone. See
    // src/lib/analytics.js.
    identifyUser(data.user);
  }, [queueStorage]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      await persistSession(data);
    },
    [persistSession]
  );

  // Always registers as "customer" - shop owners use the web dashboard.
  const register = useCallback(
    async ({ name, phone, email, password, contact_email, date_of_birth }) => {
      const { data } = await api.post("/auth/register", {
        name,
        phone,
        email,
        password,
        role: "customer",
        ...(contact_email ? { contact_email } : {}),
        ...(date_of_birth ? { date_of_birth } : {}),
      });
      await persistSession(data);
      return data.user;
    },
    [persistSession]
  );

  const storeProfile = useCallback(async (next, expectedToken, expectedId) => {
    return queueStorage(async () => {
      if (!next || next.id !== expectedId || sessionRef.current.token !== expectedToken || sessionRef.current.user?.id !== expectedId) return false;
      await AsyncStorage.setItem("user", JSON.stringify(next));
      if (sessionRef.current.token !== expectedToken || sessionRef.current.user?.id !== expectedId) return false;
      sessionRef.current = { token: expectedToken, user: next };
      setUser(next);
      return true;
    });
  }, [queueStorage]);
  const refreshProfile = useCallback(async () => {
    const expected = sessionRef.current;
    const { data } = await api.get("/auth/profile");
    return storeProfile(data.user, expected.token, expected.user?.id);
  }, [storeProfile]);
  const updateProfile = useCallback(async (details) => {
    const expected = sessionRef.current;
    const { data } = await api.patch("/auth/profile", details);
    if (!await storeProfile(data.user, expected.token, expected.user?.id)) throw new Error("Your session changed. Reopen your profile.");
    return data.user;
  }, [storeProfile]);

  const logout = useCallback(async () => {
    // Deactivate this device's push registration FIRST, while the JWT is
    // still available - the endpoint is authenticated. Only this device is
    // deactivated; the user's other devices keep receiving notifications.
    // Never throws, so a notification-service hiccup cannot block sign-out.
    const { unregisterPushToken } = await import("./OrderEventsContext");
    await unregisterPushToken();
    sessionRef.current = { user: null, token: null };
    await queueStorage(() => AsyncStorage.multiRemove(["token", "user"]));
    setToken(null);
    setUser(null);
    setSessionExpired(false);
    // Detaches the analytics identity, so events after sign-out are not
    // attributed to the customer who just left.
    clearUser();
  }, [queueStorage]);

  // A pending request may finish after its screen unmounts. Read the live
  // provider session rather than a screen's now-stale user/token closure.
  const isCurrentSession = useCallback((accountId, expectedToken) => {
    const session = sessionRef.current;
    return Boolean(accountId && expectedToken && session.token === expectedToken && String(session.user?.id || session.user?._id || "") === accountId);
  }, []);

  // Memoized so consumers don't re-render just because this provider did.
  // This context sits at the root of the whole app (see App.js), so an
  // unmemoized object literal here meant every screen reading useAuth()
  // re-rendered on any state change anywhere above them.
  const value = useMemo(
    () => ({ user, token, loading, sessionExpired, isAuthenticated: !!token, login, register, logout, refreshProfile, updateProfile, isCurrentSession }),
    [user, token, loading, sessionExpired, login, register, logout, refreshProfile, updateProfile, isCurrentSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
