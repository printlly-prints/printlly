import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { createWebEventSounds } from "../utils/webEventSounds";

const SoundContext = createContext(null);
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session ledger still deduplicates. */ } }

export function SoundProvider({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const account = String(user?.id || user?._id || "guest");
  const preferenceKey = `printlly.sounds:${account}`;
  const ledgerKey = `printlly.sound-events:${account}`;
  const [muted, setMuted] = useState(() => read(preferenceKey, false) === true);
  const enabledRef = useRef(!muted && account !== "guest");
  enabledRef.current = !muted && account !== "guest";
  const player = useMemo(() => {
    const stored = read(ledgerKey, []);
    return createWebEventSounds({ createAudio: src => new Audio(src), keys: Array.isArray(stored) ? stored.filter(key => typeof key === "string") : [], persist: keys => write(ledgerKey, keys), enabled: () => enabledRef.current });
  }, [ledgerKey]);
  useEffect(() => { setMuted(read(preferenceKey, false) === true); }, [preferenceKey]);
  useEffect(() => { player.interrupt(); }, [pathname, player]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) player.interrupt(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); player.interrupt(); };
  }, [player]);
  const toggleMute = useCallback(() => {
    setMuted(previous => { const next = !previous; write(preferenceKey, next); if (next) player.interrupt(); return next; });
  }, [preferenceKey, player]);
  const value = useMemo(() => ({ muted, toggleMute, confirm: player.confirm }), [muted, toggleMute, player]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export const useEventSounds = () => useContext(SoundContext);
export function SoundControl() {
  const { muted, toggleMute } = useEventSounds();
  return <button className="paper-button paper-button--text" aria-pressed={muted} onClick={toggleMute}>{muted ? "Event sounds muted" : "Mute event sounds"}</button>;
}
