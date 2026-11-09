import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { io } from "socket.io-client";
import api from "../api/client";
import { DEMO_MODE } from "../config/runtime";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationsContext";

// Realtime order events, plus push-token registration.
//
// Two jobs, in one place because they are two halves of the same thing: the
// socket delivers order updates while the app is open and connected, and push
// covers the rest - backgrounded, terminated, offline. Socket.io cannot wake a
// terminated app; only a push notification can, which is why both exist.
//
// The database stays the source of truth throughout. An event arriving here is
// a signal to REFRESH, never data to trust on its own: the handler re-reads
// the notification list rather than inventing a notification locally from the
// payload. So a missed event costs a few seconds of staleness and nothing
// more, and the existing polling (NotificationsContext, and the orders screens)
// continues to work exactly as before if the socket never connects at all.

const OrderEventsContext = createContext(null);

// How a notification behaves when one arrives while the app is in the
// foreground. Without this, Expo shows nothing at all in the foreground, which
// looks like push being broken.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Asks for permission and registers this device's Expo push token with the
// backend.
//
// Returns the token on success and null on every failure - and there are
// several legitimate ones: the user declined permission, this is a simulator,
// or no EAS project id is configured (see .env.example). None of them is an
// error worth surfacing to the user, because the app works without push; they
// just get no background notifications.
async function registerForPush() {
  if (DEMO_MODE) return null;
  try {
    // Push is not available on a simulator/emulator at all, so asking would
    // only produce a confusing permission prompt.
    if (!Constants.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      // Only asked once by the OS; declining is remembered.
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    // Android needs a channel declared or notifications arrive silently with
    // no heads-up display.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("orders", {
        name: "Order updates",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // The project id comes from app.json's extra.eas.projectId. Without it
    // Expo cannot mint a token, so this throws - caught below and treated as
    // "no push", which is the honest state until `eas init` has been run.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) {
      console.log("[push] no EAS project id configured - skipping push registration");
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // The backend takes the owner from the JWT, not from anything sent here.
    await api.post("/notifications/device-token", {
      token,
      platform: Platform.OS,
    });

    // Kept so logout can deactivate exactly this device and leave the user's
    // other devices receiving notifications.
    await AsyncStorage.setItem("pushToken", token);
    return token;
  } catch (error) {
    // Never fatal. The app is fully usable without push.
    console.log(`[push] registration skipped: ${error.message}`);
    return null;
  }
}

export function OrderEventsProvider({ children }) {
  const { isAuthenticated, token } = useAuth();
  const { refresh: refreshNotifications } = useNotifications();
  const [connected, setConnected] = useState(false);
  // The most recent event, so an order screen can react to its own order
  // changing without holding a socket itself.
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);

  // ---- push registration, once per authenticated session ----
  useEffect(() => {
    if (!isAuthenticated) return;
    // Registration is an upsert on the token server-side, so running it on
    // every launch costs one request and keeps a reinstalled app's new token
    // current.
    registerForPush();
  }, [isAuthenticated]);

  // ---- the socket ----
  useEffect(() => {
    if (!isAuthenticated || DEMO_MODE) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      // AuthContext holds the token in state, but on a cold start storage is
      // the only place it exists yet - same approach as SupportContext.
      const authToken = token || (await AsyncStorage.getItem("token"));
      if (!authToken || cancelled) return;

      const socket = io(process.env.EXPO_PUBLIC_API_BASE_URL, {
        auth: { token: authToken },
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", () => setConnected(false));

      socket.on("order:event", (event) => {
        if (cancelled) return;
        setLastEvent(event);
        // Re-read from the API rather than synthesising a notification from
        // the payload. The payload carries ids and a status by design; the
        // notification centre's content comes from the server, so this keeps
        // one source of truth and means a duplicate event cannot produce a
        // duplicate row in the list.
        refreshNotifications();
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, token, refreshNotifications]);

  // Coming back from the background is exactly when something was missed
  // while disconnected. socket.io reconnects on its own, but the catch-up read
  // is what closes the gap.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && isAuthenticated) refreshNotifications();
    });
    return () => subscription.remove();
  }, [isAuthenticated, refreshNotifications]);

  const value = useMemo(() => ({ connected, lastEvent }), [connected, lastEvent]);

  return <OrderEventsContext.Provider value={value}>{children}</OrderEventsContext.Provider>;
}

// Deactivates this device's push registration. Called from logout BEFORE the
// auth token is cleared, since the endpoint is authenticated.
export async function unregisterPushToken() {
  try {
    const pushToken = await AsyncStorage.getItem("pushToken");
    if (!pushToken) return;
    await api.delete("/notifications/device-token", { data: { token: pushToken } });
    await AsyncStorage.removeItem("pushToken");
  } catch (error) {
    // A failed deactivation is not worth blocking sign-out over. The token
    // stops working anyway once Expo rotates it, and the backend deactivates
    // it on the first DeviceNotRegistered response.
    console.log(`[push] could not unregister device: ${error.message}`);
  }
}

export const useOrderEvents = () => useContext(OrderEventsContext);

export default OrderEventsContext;
