import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import api from "../api/axios";
import { identifyUser, clearUser, trackEvent } from "../lib/observability";
import { readVendorSession, SESSION_KEY, writeVendorSession } from "../lib/vendorSession";

const AuthContext = createContext(null);

// Central place for auth + "does this owner already have a shop" state.
// Both the JWT and the logged-in user are persisted to localStorage so a
// page refresh doesn't force a re-login.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(readVendorSession);
  const { token, user } = session ?? {};
  const [shop, setShop] = useState(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState(false);

  const applySession = useCallback((next) => {
    setSession(next);
    setShop(null);
    setShopLoading(Boolean(next));
    setShopError(false);
    if (next) identifyUser(next.user);
    else clearUser();
  }, []);

  const clearSession = useCallback(() => {
    writeVendorSession(null);
    applySession(null);
  }, [applySession]);

  useEffect(() => {
    const sync = (event) => {
      if (event.key !== SESSION_KEY && event.key !== "token" && event.key !== null) return;
      const next = readVendorSession();
      if (next?.token !== token) applySession(next);
    };
    const interceptor = api.interceptors.response.use(undefined, (error) => {
      const currentToken = readVendorSession()?.token;
      if (
        error.response?.status === 401 &&
        error.response.data?.message === "Invalid or expired token" &&
        currentToken &&
        error.config?.headers?.Authorization === `Bearer ${currentToken}`
      ) {
        clearSession();
      }
      return Promise.reject(error);
    });
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
      api.interceptors.response.eject(interceptor);
    };
  }, [applySession, clearSession, token]);

  const loadMyShop = useCallback(async (signal) => {
    if (!token || !user) {
      setShopLoading(false);
      return;
    }
    const isCurrent = () => !signal?.aborted && readVendorSession()?.token === token;
    setShopLoading(true);
    setShopError(false);
    try {
      const { data } = await api.get("/shops/me", { signal });
      if (isCurrent()) setShop(data);
    } catch (err) {
      if (isCurrent()) {
        if (err.response?.status === 404) setShop(null);
        else setShopError(true);
      }
    } finally {
      if (isCurrent()) setShopLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    const controller = new AbortController();
    loadMyShop(controller.signal);
    return () => controller.abort();
  }, [loadMyShop]);

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

  const persistSession = useCallback((newToken, newUser) => {
    const next = { token: newToken, user: newUser };
    writeVendorSession(next);
    applySession(next);
  }, [applySession]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      persistSession(data.token, data.user);
    },
    [persistSession],
  );

  const registerPartner = useCallback(
    async ({ name, phone, email, password }) => {
      const { data } = await api.post("/auth/register", {
        name,
        phone,
        email,
        password,
        role: "shop_owner",
      });
      persistSession(data.token, data.user);
    },
    [persistSession],
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
    [persistSession],
  );

  const logout = useCallback(() => {
    const currentToken = readVendorSession()?.token;
    clearSession();
    if (currentToken) {
      // Clear the browser even offline. The saved token authorizes only this revoke request.
      void api.post("/auth/logout", null, {
        headers: { Authorization: `Bearer ${currentToken}` },
        timeout: 5000,
      }).catch(() => {});
    }
  }, [clearSession]);

  const registerShop = useCallback(async ({ shop_name, address, contact, latitude, longitude, locality, google_maps_url, google_maps_embed_url }) => {
    const { data } = await api.post("/shops", { shop_name, address, contact, latitude, longitude, locality, google_maps_url, google_maps_embed_url });
    setShop(data);
    return data;
  }, []);

  const changePassword = useCallback(async (current_password, new_password) => {
    const { data } = await api.post("/auth/change-password", { current_password, new_password });
    persistSession(data.token, user);
    return data;
  }, [persistSession, user]);

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
      shopError,
      login,
      registerPartner,
      completeGoogleLogin,
      logout,
      registerShop,
      changePassword,
      refreshShop: loadMyShop,
    }),
    [
      token,
      user,
      shop,
      shopLoading,
      shopError,
      login,
      registerPartner,
      completeGoogleLogin,
      logout,
      registerShop,
      changePassword,
      loadMyShop,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
