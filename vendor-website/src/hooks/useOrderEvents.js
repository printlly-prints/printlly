import { useEffect, useRef } from "react";
import { useVendorOrderEvents } from "../context/OrderEventsContext";

export default function useOrderEvents(onEvent) {
  const { subscribe } = useVendorOrderEvents();
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => subscribe((event) => handler.current(event)), [subscribe]);
}
