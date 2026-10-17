import { confirmedSoundEvent, createSoundLedger } from "../../../shared/soundEvents.js";

/** Browser playback adapter. Only fetched orders can confirm a sound cue. */
export function createWebEventSounds({ createAudio, keys = [], persist = () => {}, foreground = () => !document.hidden, enabled = () => true }) {
  const ledger = createSoundLedger({ initialKeys: keys });
  let current = null;
  function interrupt() {
    if (current) { current.audio.pause(); current.audio.currentTime = 0; current = null; }
    ledger.interrupt();
  }
  async function confirm(event, order) {
    const confirmed = confirmedSoundEvent(event, order);
    const claimed = ledger.claim(confirmed, { foreground: foreground(), enabled: enabled() });
    persist(ledger.keys());
    if (!claimed) return false;
    if (current) { current.audio.pause(); current.audio.currentTime = 0; }
    const audio = createAudio(`/event-sounds/${confirmed.cue}.mp3`);
    const playback = { audio, key: confirmed.key };
    current = playback;
    function finished() {
      ledger.finish(confirmed.key);
      if (current === playback) current = null;
    }
    audio.onended = finished;
    audio.onerror = finished;
    try { await audio.play(); return true; }
    catch { finished(); return false; }
  }
  return { confirm, interrupt };
}
