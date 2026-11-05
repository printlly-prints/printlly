import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { confirmedSoundEvent, createSoundLedger } from "../../../shared/soundEvents";
import { useAuth } from "./AuthContext";
import api from "../api/client";
import { canPresentConfirmedCue } from "../utils/foregroundSoundPolicy";
import { requestCuePermission } from "../utils/cuePermission";

const EventSoundsContext = createContext(null);
const CUES = {
  payment_confirmed: { title: "Payment confirmed", duration: 660 },
  ready_for_pickup: { title: "Ready for pickup", duration: 880 },
  order_cancelled: { title: "Order cancelled", duration: 560 },
  notification: { title: "Order updated", duration: 400 },
};
const ORDER_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_FAILED", "ORDER_ACCEPTED", "ORDER_READY_FOR_PICKUP", "ORDER_COMPLETED", "ORDER_EXPIRED", "ORDER_CANCELLED"]);
const nativeSupported = Platform.OS === "android" && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const defaultBehavior = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
const quietBehavior = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
let presentation = () => defaultBehavior;

// Own one foreground handler. The sound-only Expo Android path uses a direct
// ringtone and defaults to audible sound for a muted channel. A real, default-
// importance notification respects channel mute/DND and is cancellable.
if (Platform.OS !== "web") Notifications.setNotificationHandler({ handleNotification: async (notification) => presentation(notification) });

export function EventSoundsProvider({ children }) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const [error, setError] = useState("");
  const state = useRef({ accountId: null, generation: 0, ready: false, channelsReady: false, available: false, active: AppState.currentState === "active", ledger: createSoundLedger(), presentedKeys: new Set(), notificationId: null, playingKey: null });
  const timer = useRef(null), persistence = useRef(Promise.resolve()), loadPromise = useRef(Promise.resolve());

  const stopNative = useCallback(() => {
    clearTimeout(timer.current);
    const id = state.current.notificationId;
    state.current.notificationId = null;
    state.current.playingKey = null;
    if (id && nativeSupported) {
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      Notifications.dismissNotificationAsync(id).catch(() => {});
    }
  }, []);

  const persistLedger = useCallback(async (snapshot) => {
    const key = `printlly:event-sounds:seen:${snapshot.accountId}`;
    const keys = JSON.stringify(snapshot.ledger.keys());
    persistence.current = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(key, keys));
    await persistence.current;
  }, []);

  useEffect(() => {
    stopNative();
    const generation = state.current.generation + 1;
    state.current = { ...state.current, accountId, generation, ready: false, channelsReady: false, available: false, ledger: createSoundLedger(), presentedKeys: new Set() };
    setError("");
    loadPromise.current = (async () => {
      try {
        const stored = await AsyncStorage.getItem(`printlly:event-sounds:seen:${accountId}`);
        if (state.current.generation !== generation) return;
        const keys = JSON.parse(stored || "[]");
        if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) throw new Error("Invalid event history");
        state.current.ledger = createSoundLedger({ initialKeys: Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : [] });
        if (nativeSupported && accountId) {
          for (const cue of Object.keys(CUES)) await Notifications.setNotificationChannelAsync(`printlly-event-${cue}-v1`, {
            name: CUES[cue].title, importance: Notifications.AndroidImportance.DEFAULT,
            sound: `${cue}.mp3`, bypassDnd: false, enableVibrate: false, enableLights: false, showBadge: false,
            audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION, contentType: Notifications.AndroidAudioContentType.SONIFICATION,
              flags: { enforceAudibility: false, requestHardwareAudioVideoSynchronization: false } },
          });
          if (state.current.generation !== generation) return;
          state.current.channelsReady = true;
          const permission = await Notifications.getPermissionsAsync();
          if (state.current.generation === generation) state.current.available = permission.granted;
        }
      } catch {
        if (state.current.generation === generation) setError("Event sound history could not be loaded.");
      } finally {
        if (state.current.generation === generation) state.current.ready = true;
      }
    })();
    return () => { stopNative(); state.current.ledger.interrupt(); state.current.generation += 1; };
  }, [accountId, stopNative]);

  // Event cues have no app-level mute. Permission is requested only through an explicit UI action.
  const requestPermission = useCallback(async () => {
    const generation = state.current.generation;
    await loadPromise.current;
    if (!nativeSupported || generation !== state.current.generation) return false;
    try {
      const granted = await requestCuePermission(Notifications);
      if (generation !== state.current.generation) return false;
      state.current.available = state.current.channelsReady && granted;
      setError(granted ? "" : "Allow notifications in Android settings to hear order event sounds.");
      return granted;
    } catch { setError("Notification permission could not be checked."); return false; }
  }, []);

  const notifyConfirmed = useCallback(async (event, order) => {
    const initialGeneration = state.current.generation;
    await loadPromise.current;
    const snapshot = state.current;
    if (snapshot.generation !== initialGeneration || !snapshot.ready || !snapshot.accountId) return "skipped";
    const confirmed = confirmedSoundEvent(event, order);
    if (!confirmed) return "unconfirmed";
    if (snapshot.ledger.keys().includes(confirmed.key)) return "duplicate";
    const claimed = snapshot.ledger.claim(confirmed, { enabled: canPresentConfirmedCue(snapshot, confirmed.key), foreground: snapshot.active });
    if (claimed) { stopNative(); snapshot.playingKey = confirmed.key; }
    try { await persistLedger(snapshot); }
    catch {
      if (state.current !== snapshot) return "skipped";
      setError("Event sound history could not be saved. This cue was skipped to avoid repeating it.");
      snapshot.ledger.finish(confirmed.key); return "failed";
    }
    if (!claimed || state.current !== snapshot || !snapshot.active || snapshot.playingKey !== confirmed.key) return "skipped";
    const notificationId = `printlly-cue:${confirmed.key}`;
    snapshot.notificationId = notificationId;
    snapshot.presentedKeys.add(confirmed.key);
    // Delivery can be suppressed by OS channel policy, so the foreground
    // handler may never start its presentation timer. Release the ledger
    // after a bounded watchdog rather than blocking later generic cues.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (snapshot.playingKey === confirmed.key) stopNative(); snapshot.ledger.finish(confirmed.key); }, 5000);
    try {
      await Notifications.scheduleNotificationAsync({ identifier: notificationId,
        content: { title: CUES[confirmed.cue].title, body: "View your order for details.", sound: `${confirmed.cue}.mp3`,
          priority: Notifications.AndroidNotificationPriority.DEFAULT, data: { printllyEventSound: true, key: confirmed.key, cue: confirmed.cue, orderId: event.orderId, event: event.event } },
        trigger: { channelId: `printlly-event-${confirmed.cue}-v1` },
      });
      if (state.current !== snapshot || snapshot.playingKey !== confirmed.key || !snapshot.active) {
        Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => {});
        Notifications.dismissNotificationAsync(notificationId).catch(() => {});
        return "skipped";
      }
      return "played";
    } catch {
      snapshot.presentedKeys.delete(confirmed.key);
      snapshot.ledger.finish(confirmed.key); stopNative(); setError("Event sound could not be played."); return "failed";
    }
  }, [persistLedger, stopNative]);

  const notify = useCallback(async (event) => {
    if (!event?.orderId || !ORDER_EVENTS.has(event.event)) return "unconfirmed";
    const generation = state.current.generation;
    try {
      const { data } = await api.get("/orders/customer");
      if (generation !== state.current.generation) return "skipped";
      const order = data.find((item) => String(item._id) === String(event.orderId));
      return await notifyConfirmed(event, order);
    } catch { return "failed"; }
  }, [notifyConfirmed]);

  useEffect(() => {
    presentation = (notification) => {
      const data = notification?.request?.content?.data || {}, current = state.current;
      if (data.printllyEventSound) {
        if (!current.active || !current.available || data.key !== current.playingKey) return quietBehavior;
        // Start after native delivery reaches the handler, with a small pad
        // for system presentation latency; device playback still needs QA.
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { if (current.playingKey === data.key) stopNative(); current.ledger.finish(data.key); }, (CUES[data.cue]?.duration || 880) + 500);
        return { ...quietBehavior, shouldShowList: true, shouldPlaySound: true, priority: Notifications.AndroidNotificationPriority.DEFAULT };
      }
      if (data.printllySoundFallback) {
        current.presentedKeys.add(`${data.orderId}:${data.event}`);
        return defaultBehavior;
      }
      if (!data.orderId || !ORDER_EVENTS.has(data.event)) return defaultBehavior;
      const key = `${data.orderId}:${data.event}`;
      if (current.presentedKeys.has(key)) return quietBehavior;
      // Preserve normal remote presentation whenever the custom cue cannot run.
      if (current.ready && current.active && current.available && !current.ledger.keys().includes(key)) return quietBehavior;
      current.presentedKeys.add(key);
      return defaultBehavior;
    };
    if (Platform.OS === "web") return () => { presentation = () => defaultBehavior; };
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data || {};
      if (data.printllyEventSound || data.printllySoundFallback) return;
      const customCanRun = state.current.available && state.current.active;
      notify(data).then((result) => {
        if (!["failed", "unconfirmed", "skipped"].includes(result) || !customCanRun || !state.current.active || state.current.presentedKeys.has(`${data.orderId}:${data.event}`)) return;
        Notifications.scheduleNotificationAsync({ identifier: notification.request.identifier,
          content: { ...notification.request.content, sound: false, data: { ...data, printllySoundFallback: true } },
          trigger: { channelId: "orders" },
        }).catch(() => {});
      });
    });
    const appState = AppState.addEventListener("change", (next) => {
      state.current.active = next === "active";
      if (next !== "active") { stopNative(); state.current.ledger.interrupt(); }
      else if (nativeSupported) {
        const generation = state.current.generation;
        Notifications.getPermissionsAsync().then((permission) => {
          if (state.current.generation === generation) state.current.available = state.current.channelsReady && permission.granted;
        }).catch(() => {});
      }
    });
    return () => { received.remove(); appState.remove(); presentation = () => defaultBehavior; stopNative(); };
  }, [notify, stopNative]);

  const refreshPermission = useCallback(async () => {
    if (!nativeSupported) return;
    const generation = state.current.generation;
    try { const permission = await Notifications.getPermissionsAsync(); if (state.current.generation === generation) state.current.available = state.current.channelsReady && permission.granted; }
    catch {}
  }, []);
  const value = useMemo(() => ({ error, supported: nativeSupported, notifyConfirmed, notify, refreshPermission, requestPermission }), [error, notifyConfirmed, notify, refreshPermission, requestPermission]);
  return <EventSoundsContext.Provider value={value}>{children}</EventSoundsContext.Provider>;
}
export function useEventSounds() {
  const value = useContext(EventSoundsContext);
  if (!value) throw new Error("EventSoundsProvider is required.");
  return value;
}
