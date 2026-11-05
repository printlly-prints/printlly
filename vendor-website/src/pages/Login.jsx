import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PublicShell, { PaperRow } from "../components/PublicShell";
import { Artwork, Button, FormField, PaperPanel } from "../components/PaperUI";

// Login screen (route: /auth/vendor). Calls POST /auth/login through
// AuthContext, which stores the returned JWT in localStorage. On success
// we send the user to "/app", which then routes them to the dashboard or
// shop registration.
//
// Note: the backend's /auth/login looks the user up by email only, so
// phone-number login would require a backend change.
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // /auth/callback redirects back here with ?error=... when Google
  // sign-in itself failed, or when the exchange-code call afterwards did.
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Full-page redirect (not an API call) - the backend needs the actual
  // browser to hand off to Google's consent screen and back.
  const handleGoogleSignIn = () => {
    window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
  };

  return (
    <PublicShell title="Partner sign in">
      <PaperPanel className="partner-auth-card">
        <div className="partner-auth-heading"><h1>Sign in to your shop</h1><Artwork name="vendor" /></div>
        <form onSubmit={handleSubmit} className="partner-auth-form">
          <FormField label="Email" id="email" type="email" autoComplete="username" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <FormField label="Password" id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {(error || oauthError) && (
            <p role="alert" className="text-sm text-error-text bg-error-bg rounded-control p-3">
              {error || oauthError}
            </p>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <Button to="/contact" variant="text">Trouble signing in?</Button>
        <Button onClick={handleGoogleSignIn} disabled={loading} variant="secondary"><GoogleIcon />Sign in with Google</Button>
      </PaperPanel>
      <PaperRow className="auth-registration-row" to="/auth/vendor/register" title="New print shop?" detail="Create a partner account" />
    </PublicShell>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.69A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.69V4.98H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.02l3.05-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.98l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
