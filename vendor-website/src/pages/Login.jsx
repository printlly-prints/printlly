import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { unlockOrderChime } from "../lib/orderChime";
import { Link } from "react-router-dom";
import LandingHeader, {
  PaperWordmark,
} from "../components/landing/LandingHeader";
import "../styles/paper.css";

const AUTH_AVAILABLE = Boolean(import.meta.env.VITE_API_BASE_URL);

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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { login, registerPartner } = useAuth();
  const navigate = useNavigate();

  // /auth/callback redirects back here with ?error=... when Google
  // sign-in itself failed, or when the exchange-code call afterwards did.
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error");
  const signingUp = searchParams.get("mode") === "signup";
  useEffect(() => {
    setError("");
    setPassword("");
  }, [signingUp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!AUTH_AVAILABLE) {
      setError(
        "Partner accounts are currently unavailable. Please try again later.",
      );
      return;
    }
    setError("");
    setLoading(true);
    void unlockOrderChime();
    try {
      if (signingUp) {
        await registerPartner({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          password,
        });
      } else {
        await login(email.trim(), password);
      }
      navigate("/app", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          (signingUp
            ? "Could not create your account. Please try again."
            : "Login failed. Please try again."),
      );
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
    <div className="paper-theme paper-page paper-login">
      <LandingHeader />
      <main id="main-content" className="login-layout">
        <div className="login-art">
          <p>
            Good prints.
            <br />
            Great partnerships.
          </p>
          <div className="login-illustration">
            <span aria-hidden="true" />
            <img
              src="/art/themes/shopkeeper-cmyk.webp"
              width="1024"
              height="1536"
              alt="Paprout’s illustrated print partner"
            />
          </div>
        </div>
        <div className="login-card">
          <PaperWordmark />

          <h1 className="font-heading text-2xl font-bold text-text-primary mt-4 text-center">
            {signingUp ? "Create your partner account" : "Shop owner login"}
          </h1>
          <p className="text-sm text-text-secondary mt-1.5 text-center">
            {signingUp
              ? "Your first step to bringing your shop online."
              : "Sign in to manage your print orders."}
          </p>

          <button
            type="button"
            disabled={!AUTH_AVAILABLE}
            onClick={handleGoogleSignIn}
            className="mt-6 w-full flex items-center justify-center gap-2.5 min-h-11 rounded-control border border-border bg-surface text-sm font-medium text-text-primary hover:bg-background-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-text-muted">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {signingUp && (
              <>
                <div>
                  <label htmlFor="partner-name">Your name</label>
                  <input
                    id="partner-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    pattern=".*\S.*"
                  />
                </div>
                <div>
                  <label htmlFor="partner-phone">Phone number</label>
                  <input
                    id="partner-phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    pattern=".*\S.*"
                  />
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 min-h-11 border border-border rounded-control text-sm text-text-primary bg-surface placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={signingUp ? "new-password" : "current-password"}
                minLength={signingUp ? 10 : undefined}
                aria-describedby={signingUp ? "password-hint" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 min-h-11 border border-border rounded-control text-sm text-text-primary bg-surface placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {signingUp && (
                <p className="login-password-hint" id="password-hint">
                  Use at least 10 characters. Longer passphrases work well.
                </p>
              )}
            </div>

            {(error || oauthError) && (
              <p
                role="alert"
                className="text-sm text-error-text bg-error-bg rounded-control p-3"
              >
                {error || oauthError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !AUTH_AVAILABLE}
              aria-busy={loading}
              className="w-full min-h-11 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 disabled:hover:bg-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {loading
                ? signingUp
                  ? "Creating account..."
                  : "Signing in..."
                : signingUp
                  ? "Create partner account"
                  : "Sign in"}
            </button>
            {signingUp && (
              <p className="login-password-hint">
                By creating an account, you agree to the{" "}
                <Link to="/vendor-terms">partner terms</Link> and{" "}
                <Link to="/privacy">privacy policy</Link>.
              </p>
            )}
          </form>
          {!AUTH_AVAILABLE && (
            <p className="login-unavailable" role="status">
              Partner accounts are currently unavailable. Please try again later.
            </p>
          )}
          <p className="login-mode-switch">
            {signingUp ? "Already a partner? " : "New to Paprout? "}
            <Link to={signingUp ? "/auth/vendor" : "/auth/vendor?mode=signup"}>
              {signingUp ? "Sign in" : "Create a partner account"}
            </Link>
          </p>
          <nav className="login-links" aria-label="More ways to explore Paprout">
            <Link to="/print-partners" className="paper-text-link">
              Explore Paprout for shops →
            </Link>
            <Link to="/" className="paper-text-link login-back-link">
              ← Back to Paprout
            </Link>
          </nav>
        </div>
      </main>
    </div>
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
