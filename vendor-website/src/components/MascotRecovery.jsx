import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./PaperUI";
import { useAuth } from "../context/AuthContext";
import { RECOVERY_COPY, recoveryState } from "../utils/recoveryState";

/** Static individual PNG; the adjacent text communicates the state accessibly. */
export default function MascotRecovery({ reaction, error, title, message, onRetry, primaryLabel, homeTo = "/", compact = false, headingLevel = 1 }) {
  const classified = useMemo(() => recoveryState(error), [error]);
  const state = reaction || classified.reaction;
  const copy = RECOVERY_COPY[state] || RECOVERY_COPY.service_unavailable;
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const navigate = useNavigate();
  const auth = useAuth();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!classified.retryAt || classified.retryAt <= Date.now()) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [classified.retryAt]);
  const waiting = classified.retryAt > clock;
  const session = classified.session;
  async function retry() {
    if (inFlight.current || waiting) return;
    if (session) { auth?.logout(); navigate("/auth/vendor", { replace: true }); return; }
    if (!onRetry) return;
    inFlight.current = true; setBusy(true);
    try { await onRetry(); } catch { /* The owning request retains its error state. */ }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section className={`mascot-recovery${compact ? " mascot-recovery--compact" : ""}`} aria-busy={busy}>
    <div className="mascot-recovery-heading">
      <picture className="mascot-recovery-art" aria-hidden="true">
        <source media="(min-width: 768px)" srcSet={`/mascot-reactions/desktop/${state}.png`} />
        <img src={`/mascot-reactions/${state}.png`} width="96" height="96" alt="" />
      </picture>
      <div><Heading>{title || (session ? "Your session has ended." : error?.response?.status === 404 ? "This item couldn’t be found." : copy.title)}</Heading><p role="status">{message || (session ? "Sign in again to continue securely." : error?.response?.status === 404 ? "It may have been removed. Try this request again, or get help." : copy.message)}</p></div>
    </div>
    <div className="mascot-recovery-actions">
      {session || onRetry ? <Button disabled={busy || waiting} onClick={retry}>{busy ? "Trying again…" : waiting ? "Please wait…" : primaryLabel || (session ? "Sign in again" : "Try again")}</Button> : <Button to={homeTo}>{primaryLabel || "Go home"}</Button>}
      <Button variant="secondary" to="/help">Get help</Button>
    </div>
  </section>;
}
