import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { useAuth } from "./AuthContext";
import { chimeForNewOrders, chimeReady, orderSoundEnabled, unlockOrderChime } from "../lib/orderChime";
import { readVendorSession } from "../lib/vendorSession";

const OrderEventsContext = createContext(null);
const PAID = "PAYMENT_CONFIRMED";
const POLL_MS = 20_000;

export function OrderEventsProvider({ children }) {
  const { token, user, shop } = useAuth();
  const ownerId = user?.id;
  const shopId = shop?._id;
  const key = `paprout:order-sound:${ownerId}`;
  const [setting, setSetting] = useState(null);
  const enabled = setting?.key === key ? setting.enabled : orderSoundEnabled(key);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const pendingRef = useRef(new Set());
  const listeners = useRef(new Set());
  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  useEffect(() => {
    const sync = (event) => {
      if (event.key === key || event.key === null) {
        setSetting({ key, enabled: orderSoundEnabled(key) });
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);

  const setEnabled = useCallback((value) => {
    try {
      localStorage.setItem(key, value ? "on" : "off");
    } catch {
      // The setting still applies to the current tab.
    }
    setSetting({ key, enabled: value });
  }, [key]);

  useEffect(() => {
    if (!enabled) pendingRef.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (!token || !shopId || user?.role !== "shop_owner" || !import.meta.env.VITE_API_BASE_URL) return;
    const controller = new AbortController();
    const { signal } = controller;
    let socket;
    let fetching = false;
    const known = new Set();
    let baselineReady = false;
    const pending = pendingRef.current;

    const notify = (event) => listeners.current.forEach((listener) => listener(event));
    const flush = () => {
      if (signal.aborted || !chimeReady() || !pending.size) return;
      const ids = [...pending];
      pending.clear();
      const canPlay = () => !signal.aborted && enabledRef.current && readVendorSession()?.token === token;
      void chimeForNewOrders(key, ids, canPlay).catch(() => {});
    };
    const activate = () => {
      if (enabledRef.current) void unlockOrderChime().then(flush);
      else pending.clear();
    };
    const remember = (orderId) => {
      known.add(orderId);
      if (known.size > 150) known.delete(known.values().next().value);
    };
    const receive = (orderId) => {
      if (!orderId || known.has(orderId)) return false;
      remember(orderId);
      if (enabledRef.current) {
        if (pending.size >= 50) pending.delete(pending.values().next().value);
        pending.add(orderId);
        flush();
      }
      return true;
    };
    const refreshInbox = async () => {
      if (signal.aborted || fetching) return;
      fetching = true;
      try {
        const { data } = await api.get("/notifications", { signal });
        if (signal.aborted) return;
        let missed = false;
        for (const item of [...data].reverse()) {
          if (item.type !== "vendor_new_order" || !item.order_id) continue;
          if (!baselineReady || item.read) remember(item.order_id);
          else if (receive(item.order_id)) missed = true;
        }
        baselineReady = true;
        if (missed) notify({ event: PAID });
      } catch {
        // Keep the last baseline and retry on the next poll or reconnect.
      } finally {
        fetching = false;
      }
    };

    void refreshInbox();
    const timer = setInterval(refreshInbox, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refreshInbox();
    };
    window.addEventListener("click", activate, true);
    window.addEventListener("keydown", activate, true);
    document.addEventListener("visibilitychange", onVisible);
    if (navigator.userActivation?.hasBeenActive) activate();

    void import("socket.io-client").then(({ io }) => {
      if (signal.aborted) return;
      socket = io(import.meta.env.VITE_API_BASE_URL, { auth: { token } });
      socket.on("connect", () => {
        notify();
        void refreshInbox();
      });
      socket.on("order:event", (event) => {
        if (event?.event === PAID && event.paymentStatus === "paid") {
          receive(event.orderId);
          void refreshInbox();
        }
        notify(event);
      });
    }).catch(() => {});

    return () => {
      controller.abort();
      socket?.disconnect();
      pending.clear();
      clearInterval(timer);
      window.removeEventListener("click", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, shopId, token, user?.role]);

  const value = useMemo(() => ({ enabled, setEnabled, subscribe }), [enabled, setEnabled, subscribe]);
  return <OrderEventsContext.Provider value={value}>{children}</OrderEventsContext.Provider>;
}

export const useVendorOrderEvents = () => useContext(OrderEventsContext);
