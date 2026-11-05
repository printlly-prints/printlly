import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { PaperPanel, Button, FormField } from "../components/PaperUI";
import { useAuth } from "../context/AuthContext";
import Switch from "../components/Switch";
import api from "../api/axios";

/** Active P13, mapped to existing open/busy/closed and business-hour fields. */
export default function Availability() {
  const { shop, refreshShop } = useAuth();
  const [status, setStatus] = useState(shop.shop_status || (shop.is_open ? "open" : "closed"));
  const [prep, setPrep] = useState(String(shop.busy_prep_minutes || 20));
  const [duration, setDuration] = useState(shop.busy_until ? "keep" : "");
  const [hours, setHours] = useState({ enabled: !!shop.business_hours?.enabled, open_time: shop.business_hours?.open_time || "09:00", close_time: shop.business_hours?.close_time || "21:00" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await api.patch("/shops/me/status", { shop_status: status, business_hours: hours, ...(status === "busy" ? { busy_prep_minutes: Number(prep), ...(duration === "keep" ? {} : { busy_for_minutes: duration ? Number(duration) : null }) } : {}) });
      await refreshShop({ background: true }); setSuccess("Availability saved.");
    } catch (err) { setError(err.response?.data?.message || "Could not update your availability. Please try again."); }
    finally { setSaving(false); }
  }
  return <DashboardLayout title="Availability">
    <PaperPanel><h1 className="partner-section-title">Accepting new orders</h1><p>Set your availability and preparation estimate.</p></PaperPanel>
    <form className="partner-auth-form" onSubmit={save}>
      <fieldset className="availability-options"><legend>Shop status</legend>{[{value:"open",label:"Open"},{value:"busy",label:"Busy"},{value:"closed",label:"Closed"}].map(option => <button key={option.value} type="button" className={`paper-button ${status === option.value ? "paper-button--primary" : "paper-button--secondary"}`} aria-pressed={status === option.value} onClick={() => setStatus(option.value)}>{option.label}</button>)}</fieldset>
      {status === "busy" && <>
        <FormField id="busy-estimate" label="Preparation estimate" type="number" min="1" max="240" step="1" value={prep} onChange={event => setPrep(event.target.value)} hint="Minutes. Customers see this as an estimate." required />
        <div className="paper-field"><label htmlFor="busy-duration">Busy until</label><select id="busy-duration" value={duration} onChange={event => setDuration(event.target.value)}>{shop.busy_until && <option value="keep">Keep current timer</option>}<option value="">Until I change it</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select>{shop.busy_until && <small>Current timer ends {new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(shop.busy_until))} IST.</small>}</div>
      </>}
      <PaperPanel className="availability-hours"><h2>Opening hours</h2><div className="availability-schedule"><Switch checked={hours.enabled} onChange={enabled => setHours(previous => ({ ...previous, enabled }))} label="Use opening hours" /><span>Use a daily schedule</span></div>{hours.enabled && <div className="availability-time-fields"><FormField id="shop-opens" label="Opens at" type="time" value={hours.open_time} onChange={event => setHours(previous => ({ ...previous, open_time: event.target.value }))} required /><FormField id="shop-closes" label="Closes at" type="time" value={hours.close_time} onChange={event => setHours(previous => ({ ...previous, close_time: event.target.value }))} required /></div>}<p>{hours.enabled ? "Hours use Indian Standard Time. Outside this schedule, the shop is closed to new orders." : "Your shop follows the status you select."}</p></PaperPanel>
      {error && <p role="alert" className="paper-error">{error}</p>}{success && <p role="status" className="availability-success">{success}</p>}
      <Button type="submit" disabled={saving}>{saving ? "Saving availability…" : "Save availability"}</Button>
    </form>
  </DashboardLayout>;
}
