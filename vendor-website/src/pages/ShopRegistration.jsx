import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PublicShell from "../components/PublicShell";
import { Button, FormField, PaperPanel } from "../components/PaperUI";
import { useAuth } from "../context/AuthContext";

/** Shop creation stays separate from account registration and KYC submission. */
export default function ShopRegistration() {
  const { shop, registerShop } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ shop_name: "", address: "", contact: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (loading) return;
    setError(""); setLoading(true);
    try { await registerShop(form); navigate("/shop-profile", { replace: true }); }
    catch (err) { setError(err.response?.data?.message || "Could not register shop. Please try again."); }
    finally { setLoading(false); }
  }
  return <PublicShell title={shop ? "Your shop" : "Register your shop"}>
    <PaperPanel><h1 className="partner-page-title">Bring your shop to Printlly</h1><p>Add your shop details, then continue to photos and verification.</p></PaperPanel>
    {shop ? <PaperPanel><h2>{shop.shop_name}</h2><p>{shop.address}</p><p>{shop.contact}</p><div className="store-links"><Button to="/orders">Go to orders</Button><Button to="/shop-profile" variant="secondary">Photos & verification</Button></div></PaperPanel> :
      <form className="partner-auth-form" onSubmit={submit}>
        <FormField label="Shop name" id="shop-name" name="shop_name" autoComplete="organization" value={form.shop_name} onChange={change} required />
        <FormField label="Shop address" id="shop-address" name="address" autoComplete="street-address" multiline rows={3} value={form.address} onChange={change} required />
        <FormField label="Contact number" id="shop-contact" name="contact" type="tel" autoComplete="tel" value={form.contact} onChange={change} required />
        {error && <p className="paper-error" role="alert">{error}</p>}
        <Button type="submit" disabled={loading}>{loading ? "Registering shop…" : "Continue to verification"}</Button>
      </form>}
  </PublicShell>;
}
