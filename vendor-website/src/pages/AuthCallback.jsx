import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// Landing page for the Google OAuth redirect: the backend sends the
// browser to /auth/callback?code=<one-time code> after a successful
// Google sign-in (or ?error=... if it failed at Google or on our side).
//
// This page trades that code for a real JWT, then checks whether the
// owner already has a shop to decide where they land next.
export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeGoogleLogin } = useAuth();
  const [message, setMessage] = useState("Signing you in...");

  // Effects run twice in React StrictMode during development. The
  // exchange-code endpoint is one-time-use, so a second call with the
  // same code would fail - this guard makes sure we only ever run once.
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const oauthError = searchParams.get("error");
    const code = searchParams.get("code");

    const goToLoginWithError = (msg) => {
      navigate(`/auth/vendor?error=${encodeURIComponent(msg)}`, { replace: true });
    };

    if (oauthError) {
      goToLoginWithError(oauthError);
      return;
    }

    if (!code) {
      goToLoginWithError("Missing sign-in code. Please try again.");
      return;
    }

    (async () => {
      try {
        await completeGoogleLogin(code);
      } catch (err) {
        goToLoginWithError(
          err.response?.data?.message || "Google sign-in link has expired. Please try again."
        );
        return;
      }

      setMessage("Checking your shop...");

      try {
        await api.get("/shops/me");
        navigate("/dashboard", { replace: true });
      } catch (err) {
        if (err.response?.status === 404) {
          navigate("/register-shop", { replace: true });
        } else {
          // Signed in fine, but the shop check itself failed (e.g. a
          // network blip) - land on "/app" and let the normal app routing
          // (which re-checks the shop) sort out where to go.
          navigate("/app", { replace: true });
        }
      }
    })();
  }, [searchParams, navigate, completeGoogleLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <p className="text-sm text-text-secondary">{message}</p>
    </div>
  );
}
