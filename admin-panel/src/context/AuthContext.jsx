import { createContext, useCallback, useContext, useMemo, useState } from "react";
import api from "../api/axios";
import { identifyUser, clearUser } from "../lib/observability";

const AuthContext = createContext(null);

// Admin session state.
//
// There is no registration path here at all, by design: admin accounts
// exist only because someone ran scripts/createAdmin.js against the
// server, and POST /auth/register silently downgrades any attempt to
// sign up as one. This context therefore only ever logs in or out.
//
// Login itself is the ordinary POST /auth/login every other user hits -
// there is no admin-specific credential store. What makes a session an
// admin session is the role inside the returned JWT, which is what every
// /admin/* route checks server-side. The role check below is a UX guard
// (so a vendor typing their own password into this panel gets a clear
// message instead of a wall of 403s), never the security boundary.
//
// The token is stored under "admin_token" rather than the vendor
// dashboard's "token" so the two can never be confused if they are ever
// served from the same origin.
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("admin_token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("admin_user");
    return stored ? JSON.parse(stored) : null;
  });

  const logout = useCallback(() => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    setToken(null);
    setUser(null);
    // Detaches the identity, so an error after signing out is not attributed
    // to the admin who just left.
    clearUser();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });

    // Refuse a valid-but-non-admin login here rather than storing a
    // session that would fail on every subsequent request. The server
    // would reject those calls anyway; this just makes the reason legible
    // at the point the person can actually act on it.
    if (data.user?.role !== "admin") {
      throw new Error("That account isn't an admin. Use an admin account to sign in here.");
    }

    localStorage.setItem("admin_token", data.token);
    localStorage.setItem("admin_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    // Id and role only - never the admin's name or email. See
    // lib/observability.js.
    identifyUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ token, user, isAuthenticated: Boolean(token), login, logout }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
