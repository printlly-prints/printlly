import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { Button, FormField, PaperPanel } from "../components/PaperUI";
import { PaperRow } from "../components/PublicShell";
import ServicesManager from "../components/ServicesManager";
import api from "../api/axios";
import MascotRecovery from "../components/MascotRecovery";

const EMPTY = { rate_per_page_bw: "", rate_per_page_color: "", paper_size_rates: { A3: "" }, sides_extra_rate: "" };

/** Active P12; additional paper/sides fields preserve existing supported rates. */
export default function PricingPage() {
  const [pricing, setPricing] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [requestError, setRequestError] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(""); setRequestError(null);
    api.get("/shops/me/pricing").then(({data}) => {
      if (active) setPricing({ rate_per_page_bw: String(data.rate_per_page_bw ?? ""), rate_per_page_color: String(data.rate_per_page_color ?? ""), paper_size_rates: { A3: String(data.paper_size_rates?.A3 ?? "") }, sides_extra_rate: String(data.sides_extra_rate ?? "") });
    }).catch(error => { if (active) { setLoadError(error.response?.data?.message || "Could not load your pricing."); setRequestError(error); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const validation = useMemo(() => [pricing.rate_per_page_bw, pricing.rate_per_page_color, pricing.paper_size_rates.A3, pricing.sides_extra_rate].every(value => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0), [pricing]);
  const field = (name, value) => setPricing(previous => ({ ...previous, [name]: value }));
  async function save(event) {
    event.preventDefault();
    if (saving || !validation) return;
    setSaving(true); setSaveError(""); setSaveSuccess("");
    try {
      await api.patch("/shops/me/pricing", { rate_per_page_bw: Number(pricing.rate_per_page_bw), rate_per_page_color: Number(pricing.rate_per_page_color), paper_size_rates: { A3: Number(pricing.paper_size_rates.A3) }, sides_extra_rate: Number(pricing.sides_extra_rate) });
      setSaveSuccess("Pricing saved.");
    } catch (error) { setSaveError(error.response?.data?.message || "Could not save pricing. Please try again."); }
    finally { setSaving(false); }
  }
  return <DashboardLayout title="Pricing & finishing">
    <PaperPanel><h1 className="partner-section-title">Print prices</h1><p>Set prices for the services your shop provides.</p></PaperPanel>
    {loading ? <PaperPanel><p role="status">Loading your pricing…</p></PaperPanel> : loadError ? <MascotRecovery compact headingLevel={2} error={requestError} onRetry={() => setRevision(previous => previous + 1)} /> :
      <form className="partner-auth-form" onSubmit={save}>
        <FormField id="rate_bw" label="A4 black & white / page" type="number" min="0" step="0.01" value={pricing.rate_per_page_bw} onChange={event => field("rate_per_page_bw", event.target.value)} hint="Price in rupees, per page and copy." required />
        <FormField id="rate_color" label="A4 colour / page" type="number" min="0" step="0.01" value={pricing.rate_per_page_color} onChange={event => field("rate_per_page_color", event.target.value)} hint="Price in rupees, per page and copy." required />
        <PaperPanel className="partner-auth-form"><h2>Paper & sides</h2><p>A4 has no paper surcharge. These extras apply per printed page and copy.</p>
          <FormField id="rate_a3" label="A3 paper surcharge" type="number" min="0" step="0.01" value={pricing.paper_size_rates.A3} onChange={event => setPricing(previous => ({ ...previous, paper_size_rates: { A3: event.target.value } }))} hint="Extra price in rupees." required />
          <FormField id="rate_sides" label="Double-sided extra" type="number" min="0" step="0.01" value={pricing.sides_extra_rate} onChange={event => field("sides_extra_rate", event.target.value)} hint="Extra price in rupees." required />
        </PaperPanel>
        {!validation && <p role="alert" className="paper-error">Enter a price of ₹0 or more in every rate field.</p>}
        {saveError && <p role="alert" className="paper-error">{saveError}</p>}{saveSuccess && <p role="status" className="availability-success">{saveSuccess}</p>}
        <Button type="submit" disabled={saving || !validation}>{saving ? "Saving prices…" : "Save prices"}</Button>
      </form>}
    <section id="services"><ServicesManager /></section>
    <PaperRow className="partner-availability-row" to="/availability" title="Opening hours & availability" detail="Manage your schedule and preparation estimate" />
  </DashboardLayout>;
}
