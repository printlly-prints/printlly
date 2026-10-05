import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Realtime order events for the vendor dashboard.
//
// Deliberately tiny, and deliberately NOT a source of data: it calls the
// callback when something happened to one of this shop's orders, and the
// dashboard responds by re-running the fetch it already had. So the payload is
// never rendered, the existing polling stays in place as the fallback, and if
// the socket never connects the dashboard behaves exactly as it did before -
// just with the latency it had before too.
//
// The shop room is joined server-side at connect time, from the shops this
// owner actually owns (config/socket.js). Nothing here names a room, so a
// vendor cannot ask to listen to another shop.
export default function useOrderEvents(onEvent) {
  // Held in a ref so a changing callback identity does not tear the socket
  // down and reconnect on every render.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;

    const socket = io(import.meta.env.VITE_API_BASE_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("order:event", (event) => {
      handlerRef.current?.(event);
    });

    return () => socket.disconnect();
  }, []);
}
