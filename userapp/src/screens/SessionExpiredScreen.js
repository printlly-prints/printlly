import { useState } from "react";
import ScreenFrame from "../components/ScreenFrame";
import RecoveryState from "../components/RecoveryState";
import Button from "../components/Button";
import { useAuth } from "../context/AuthContext";
export default function SessionExpiredScreen() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const signIn = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    try { await logout(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <ScreenFrame title="Session ended" hideNavigation footer={<Button title="Sign in again" loading={busy} onPress={signIn} />}>
    <RecoveryState reaction="access_expired" title="Your session has ended." message={failed ? "We couldn’t finish signing out. Try again to return to sign-in." : "Sign in again to continue. Your confirmed orders remain available in your account."} />
  </ScreenFrame>;
}
