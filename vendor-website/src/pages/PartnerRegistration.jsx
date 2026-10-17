import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PublicShell from "../components/PublicShell";
import { Artwork, Button, FormField, PaperPanel } from "../components/PaperUI";
import { useAuth } from "../context/AuthContext";

/** P02 visual vocabulary; required account fields use the existing auth contract. */
export default function PartnerRegistration() {
  const { registerPartner } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setField = (event) => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await registerPartner({ ...form, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() });
      navigate("/register-shop", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not create your account. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <PublicShell title="Create partner account">
      <PaperPanel className="partner-auth-card">
        <div className="partner-auth-heading"><h1>Bring your shop to Printlly</h1><Artwork name="vendor" /></div>
        <p>Create your account, then add your shop details for verification.</p>
        <form onSubmit={submit} className="partner-auth-form">
          <FormField label="Your name" id="partner-name" name="name" autoComplete="name" value={form.name} onChange={setField} required />
          <FormField label="Phone number" id="partner-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={setField} required />
          <FormField label="Email" id="partner-email" name="email" type="email" autoComplete="email" value={form.email} onChange={setField} required />
          <FormField label="Password" id="partner-password" name="password" type="password" autoComplete="new-password" minLength={10} hint="Use at least 10 characters." value={form.password} onChange={setField} required />
          {error && <p role="alert" className="paper-error">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? "Creating account..." : "Create partner account"}</Button>
        </form>
        <Link className="auth-back-link" to="/auth/vendor">Already registered? Sign in</Link>
      </PaperPanel>
    </PublicShell>
  );
}
