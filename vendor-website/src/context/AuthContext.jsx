import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { identifyUser, clearUser, trackEvent } from "../lib/observability";

const AuthContext = createContext(null);

// Central place for auth + "does this owner already have a shop" state.
// Both the JWT and the logged-in user are persisted to localStorage so a
// page refresh doesn't force a re-login.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [shop, setShop] = useState(null);
  const [shopLoading, setShopLoading] = useState(true);

  // GET /shops/me returns this owner's shop, or 404 if they haven't
  // registered one yet - a 404 here just means "no shop", not an error.
  // useCallback so the memoized context value below has a stable
  // `refreshShop` identity - without it the value would be rebuilt on
  // every render and the memoization would do nothing.
  const loadMyShop = useCallback(async () => {
    if (!token || !user) {
      setShop(null);
      setShopLoading(false);
      return;
    }
    setShopLoading(true);
    try {
      const { data } = await api.get("/shops/me");
      setShop(data);
    } catch (err) {
      setShop(null);
    } finally {
      setShopLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    loadMyShop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // A page reload restores the session from localStorage without going
  // through persistSession, so without this the identity would be missing for
  // every visit after the first - which is most of them.
  useEffect(() => {
    if (user) {
      identifyUser(user);
      trackEvent("app_opened", { role: user.role });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shared by both login paths so a JWT always lands in localStorage and
  // state the same way, regardless of how it was obtained.
  const persistSession = useCallback((newToken, newUser) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    // Attaches the vendor's id and role to subsequent error reports, so an
    // issue in Sentry can be traced to an account without the dashboard
    // having sent a name, email or phone number anywhere. No-op when the
    // keys are unset. See lib/observability.js.
    identifyUser(newUser);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      persistSession(data.token, data.user);
    },
    [persistSession]
  );

  // Used by the /auth/callback page after Google redirects back with a
  // one-time code. Exchanges it for the real JWT via the backend, which
  // deletes the code on first use - so this must only ever be called once
  // per code.
  const completeGoogleLogin = useCallback(
    async (code) => {
      const { data } = await api.post("/auth/exchange-code", { code });
      persistSession(data.token, data.user);
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setShop(null);
    // Detaches the identity, so an error on the login page after signing out
    // is not attributed to the vendor who just left - which matters most on a
    // shared machine in a shop.
    clearUser();
  }, []);

  const registerShop = useCallback(async ({ shop_name, address, contact }) => {
    const { data } = await api.post("/shops", { shop_name, address, contact });
    setShop(data);
    return data;
  }, []);

  // Memoized so every page reading useAuth() (the sidebar, the
  // deactivation banner, every protected route) doesn't re-render purely
  // because this provider re-rendered with a fresh object identity.
  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token,
      shop,
      shopLoading,
      login,
      completeGoogleLogin,
      logout,
      registerShop,
      refreshShop: loadMyShop,
    }),
    [token, user, shop, shopLoading, login, completeGoogleLogin, logout, registerShop, loadMyShop]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
