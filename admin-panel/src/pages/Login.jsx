import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminBrand from "../components/AdminBrand";

// Email + password only.
//
// No Google button and no "create an account" link, both deliberately:
// admin accounts are created exclusively by scripts/createAdmin.js on the
// server, and Google sign-in is a vendor-onboarding convenience that has
// no place on an internal tool. There is nothing to link to here.
export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate("/", { replace: true });
    } catch (err) {
      // Two shapes reach here: an axios error from the API (wrong
      // credentials) and the plain Error AuthContext throws when the
      // account is real but isn't an admin. The latter's message is the
      // useful one, so it takes precedence over the generic fallback.
      setError(err.response?.data?.message || err.message || "Could not sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm py-10">
        <div className="mb-8 flex justify-center"><AdminBrand /></div>
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-text-primary">Admin sign in</h1>
          <p className="text-sm text-text-secondary mt-2">Manage shops, orders and customer support.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface rounded-panel border border-border p-6 space-y-5 shadow-card">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-3 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-3 border border-border rounded-control text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            />
          </div>

          {error && <p role="alert" className="text-sm text-error-text bg-error-bg rounded-control p-3">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-11 px-4 py-3 rounded-control bg-primary text-white text-sm font-semibold hover:bg-primary-deep transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-muted">
          Access is limited to authorized team members.
        </p>
      </div>
    </div>
  );
}
