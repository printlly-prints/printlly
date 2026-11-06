import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Imported lazily inside logout rather than at module scope:
// OrderEventsContext imports useAuth from here, so a top-level import
// would be a require cycle.
import api from "../api/client";
import { assertCustomerSession } from "../utils/authValidation";
import { identifyUser, clearUser } from "../lib/analytics";

const AuthContext = createContext(null);

// Holds the logged-in customer and their JWT. Both are persisted to
// AsyncStorage so closing and reopening the app keeps you signed in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while reading storage on launch

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
    assertCustomerSession(data);
    await AsyncStorage.setItem("token", data.token);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    // Id and role only - never the customer's name, email or phone. See
    // src/lib/analytics.js.
    identifyUser(data.user);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post(
        "/auth/login",
        { email, password },
        { timeout: 20000 },
      );
      await persistSession(data);
    },
    [persistSession],
  );

  // Always registers as "customer" - shop owners use the web dashboard.
  const register = useCallback(
    async ({ name, phone, email, password }) => {
      const { data } = await api.post(
        "/auth/register",
        {
          name,
          phone,
          email,
          password,
          role: "customer",
        },
        { timeout: 20000 },
      );
      await persistSession(data);
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    // Deactivate this device's push registration FIRST, while the JWT is
    // still available - the endpoint is authenticated. Only this device is
    // deactivated; the user's other devices keep receiving notifications.
    // Never throws, so a notification-service hiccup cannot block sign-out.
    const { unregisterPushToken } = await import("./OrderEventsContext");
    await unregisterPushToken();
    await AsyncStorage.multiRemove(["token", "user"]);
    setToken(null);
    setUser(null);
    // Detaches the analytics identity, so events after sign-out are not
    // attributed to the customer who just left.
    clearUser();
  }, []);

  // Memoized so consumers don't re-render just because this provider did.
  // This context sits at the root of the whole app (see App.js), so an
  // unmemoized object literal here meant every screen reading useAuth()
  // re-rendered on any state change anywhere above them.
  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!token,
      login,
      register,
      logout,
    }),
    [user, token, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
