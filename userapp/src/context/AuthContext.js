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
import {
  assertCustomerSession,
  normalizeCustomerUser,
} from "../utils/authValidation";
import { DEMO_MODE, SESSION_KEYS } from "../config/runtime";
import { DEMO_SESSION } from "../demo/store";
import { googleIdToken } from "../lib/googleSignIn";
import { identifyUser, clearUser } from "../lib/analytics";
import {
  profilePreferencesKey,
  validateProfilePreferences,
} from "../utils/profilePreferences";

const AuthContext = createContext(null);

// Holds the logged-in customer and their JWT. Both are persisted to
// AsyncStorage so closing and reopening the app keeps you signed in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while reading storage on launch
  const [appearanceRecord, setAppearanceRecord] = useState(null);
  const [appearanceLoadedId, setAppearanceLoadedId] = useState(null);
  const appearance =
    user?._id && appearanceRecord?.id === user._id
      ? appearanceRecord.value
      : null;

  useEffect(() => {
    let active = true;
    if (user?._id) {
      AsyncStorage.getItem(profilePreferencesKey(user._id))
        .then((stored) => {
          const value = stored ? JSON.parse(stored) : null;
          if (active && value && !validateProfilePreferences(value))
            setAppearanceRecord({ id: user._id, value });
        })
        .catch(() => {})
        .finally(() => {
          if (active) setAppearanceLoadedId(user._id);
        });
    }
    return () => {
      active = false;
    };
  }, [user?._id]);

  // Appearance is device-local; account identity and payment contact remain server-owned.
  const saveAppearance = useCallback(
    async (value, { updateBasics = false } = {}) => {
      const message = validateProfilePreferences(value);
      if (message) throw new Error(message);
      if (!user?._id) throw new Error("Sign in to customize your profile.");
      const next = { ...value, name: value.name.trim() };
      const gender = next.gender || user.gender || "prefer_not_to_say";
      if (
        updateBasics &&
        !DEMO_MODE &&
        (next.name !== user.name ||
          gender !== (user.gender || "prefer_not_to_say"))
      ) {
        const { data } = await api.patch("/auth/me", {
          name: next.name,
          gender,
        });
        const updated = normalizeCustomerUser(data.user);
        await AsyncStorage.setItem(SESSION_KEYS.user, JSON.stringify(updated));
        setUser(updated);
      }
      await AsyncStorage.setItem(
        profilePreferencesKey(user._id),
        JSON.stringify(next),
      );
      setAppearanceRecord({ id: user._id, value: next });
    },
    [user?._id, user?.gender, user?.name],
  );

  // Restore a previous session on app start.
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEYS.token),
          AsyncStorage.getItem(SESSION_KEYS.user),
        ]);
        if (storedToken) setToken(storedToken);
        if (storedUser) {
          const parsed = normalizeCustomerUser(JSON.parse(storedUser));
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
    data = { ...data, user: normalizeCustomerUser(data.user) };
    await AsyncStorage.setItem(SESSION_KEYS.token, data.token);
    await AsyncStorage.setItem(SESSION_KEYS.user, JSON.stringify(data.user));
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
    async ({ name, phone, email, password, gender }) => {
      const { data } = await api.post(
        "/auth/register",
        {
          name,
          phone,
          email,
          password,
          role: "customer",
          gender,
        },
        { timeout: 20000 },
      );
      await persistSession(data);
    },
    [persistSession],
  );

  const enterDemo = useCallback(async () => {
    if (!DEMO_MODE) throw new Error("Demo mode is not enabled.");
    await persistSession(DEMO_SESSION);
  }, [persistSession]);

  const loginWithGoogle = useCallback(async () => {
    const idToken = await googleIdToken();
    if (!idToken) return;
    const { data } = await api.post(
      "/auth/google/customer",
      { id_token: idToken },
      { timeout: 20000 },
    );
    await persistSession(data);
  }, [persistSession]);

  const logout = useCallback(async () => {
    // Deactivate this device's push registration FIRST, while the JWT is
    // still available - the endpoint is authenticated. Only this device is
    // deactivated; the user's other devices keep receiving notifications.
    // Never throws, so a notification-service hiccup cannot block sign-out.
    const { unregisterPushToken } = await import("./OrderEventsContext");
    await unregisterPushToken();
    await AsyncStorage.multiRemove([SESSION_KEYS.token, SESSION_KEYS.user]);
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
      loading: loading || Boolean(user?._id && appearanceLoadedId !== user._id),
      isAuthenticated: !!token,
      login,
      loginWithGoogle,
      enterDemo,
      register,
      logout,
      appearance,
      saveAppearance,
    }),
    [
      user,
      token,
      loading,
      login,
      loginWithGoogle,
      enterDemo,
      register,
      logout,
      appearance,
      saveAppearance,
      appearanceLoadedId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
