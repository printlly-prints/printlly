import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import PublicShell from "../components/PublicShell";
import DashboardLayout from "../components/DashboardLayout";
import MascotRecovery from "../components/MascotRecovery";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

/** Dedicated read-only recovery: home opens only after the actual read succeeds. */
export default function RecoveryPage({ reaction = "not_found", requestError = null }) {
  const [localError, setError] = useState(null);
  const error = requestError || localError;
  const navigate = useNavigate();
  const { isAuthenticated, shop } = useAuth();
  const home = isAuthenticated && shop ? "/dashboard" : "/";
  const retry = useCallback(async () => {
    try { await api.get("/shops"); navigate(home, { replace: true }); }
    catch (failure) { setError(failure); }
  }, [home, navigate]);
  const Shell = isAuthenticated && shop ? DashboardLayout : PublicShell;
  return <Shell title="Printlly" footer={false}><div className="recovery-page"><MascotRecovery reaction={error ? undefined : reaction} error={error} homeTo={home} onRetry={reaction === "not_found" || reaction === "access_expired" ? undefined : retry} /></div></Shell>;
}
