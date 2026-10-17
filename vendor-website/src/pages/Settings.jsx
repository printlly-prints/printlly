import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { PaperPanel, Button } from "../components/PaperUI";
import { PaperRow } from "../components/PublicShell";
import { AppearanceControl } from "../context/ThemeContext";
import { SoundControl } from "../context/SoundContext";
import { useAuth } from "../context/AuthContext";

/** Active P16; appearance/sounds are browser preferences, account data is read-only. */
export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return <DashboardLayout title="Preferences">
    <PaperPanel><h2>Account</h2><p>{user?.email || "Email is unavailable."}</p><p>Account changes aren’t available here yet.</p></PaperPanel>
    <PaperPanel><h2>Appearance & event sounds</h2><p>Choose light, dark or your system theme and mute confirmed order sounds. These preferences are saved in this browser.</p><div className="settings-preferences"><AppearanceControl /><SoundControl /></div></PaperPanel>
    <PaperRow className="partner-availability-row" to="/contact" title="Support" detail="Get help with your shop" />
    <Button variant="text" onClick={() => { logout(); navigate("/auth/vendor"); }}>Sign out</Button>
  </DashboardLayout>;
}
