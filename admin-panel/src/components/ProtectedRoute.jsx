import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Gate for every page except Login.
//
// Two layers, deliberately: this component checks that a session exists
// locally (cheap, instant, no flash of an empty dashboard), while the
// interceptor below catches the case a stored token is expired or has had
// its role changed since - something no client-side check can know.
// Neither is the real security boundary; the server's requireRole("admin")
// on every /admin/* route is.
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, logout } = useAuth();

  useEffect(() => {
    // A 401 means the stored token is gone stale (expired, or the account
    // was removed) - drop the session so the redirect below sends the
    // person to Login rather than leaving them on a page whose every
    // request fails. A 403 is deliberately NOT treated this way: it means
    // the token is valid but not an admin, which is a different problem
    // and shouldn't silently log someone out mid-action.
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => api.interceptors.response.eject(interceptor);
  }, [logout]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
