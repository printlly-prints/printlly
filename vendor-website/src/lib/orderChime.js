let audio;
let historyDb;

export async function unlockOrderChime() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  try {
    audio ??= new AudioContext();
    if (audio.state !== "running") await audio.resume();
    return audio.state === "running";
  } catch {
    return false;
  }
}

export function chimeReady() {
  return audio?.state === "running";
}

export function playOrderChime() {
  if (!chimeReady()) return false;
  const now = audio.currentTime;
  for (const [frequency, offset] of [[660, 0], [880, 0.13]]) {
    const start = now + offset;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.001, start);
    volume.gain.exponentialRampToValueAtTime(0.24, start + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.27);
    tone.connect(volume).connect(audio.destination);
    tone.onended = () => {
      tone.disconnect();
      volume.disconnect();
    };
    tone.start(start);
    tone.stop(start + 0.28);
  }
  return true;
}

export function orderSoundEnabled(key) {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
}

function openHistory() {
  historyDb ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("paprout-order-alerts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("history");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return historyDb;
}

export async function chimeForNewOrders(key, orderIds, canPlay) {
  const canRing = () => canPlay() && orderSoundEnabled(key);
  const nextHistory = (played) => {
    const unseen = orderIds.filter((id) => !played.includes(id));
    return unseen.length && canRing() && playOrderChime()
      ? [...played, ...unseen].slice(-100)
      : null;
  };
  const playOnce = () => {
    const historyKey = `${key}:played`;
    let played = [];
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey));
      if (Array.isArray(saved)) played = saved;
    } catch {
      // The tab still has its own order baseline if browser storage is unavailable.
    }
    const next = nextHistory(played);
    if (!next) return;
    try {
      localStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      // Playback still works for this tab.
    }
  };
  let db;
  try {
    db = await openHistory();
  } catch {
    if (navigator.locks) await navigator.locks.request(key, playOnce);
    else playOnce();
    return;
  }

  // A read-write transaction serializes the claim across tabs, even when they
  // receive the socket event before their local storage caches synchronize.
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("history", "readwrite");
    const store = transaction.objectStore("history");
    const read = store.get(key);
    read.onsuccess = () => {
      const next = nextHistory(read.result ?? []);
      if (next) store.put(next, key);
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}
