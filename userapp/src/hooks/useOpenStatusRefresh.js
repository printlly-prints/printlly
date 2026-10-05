import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

// How a shop is trading right now (open / busy / closed) is computed by
// the BACKEND at the moment of the request (utils/shopStatus.js) and
// sent as a fixed shop_status - the raw fields it's derived from are
// deliberately never sent to a customer, so this side can't recompute
// the answer locally as the clock moves. A screen that fetched at 20:59
// would keep showing a shop as open well past its 21:00 close until
// something else happened to refetch - and likewise would keep showing
// Busy after the vendor's timed Busy had already lapsed.
//
// So: re-run the screen's own fetch once a minute while it's focused.
// Unfocused screens don't poll (useFocusEffect tears the timer down), and
// ordering is still gated server-side at order-creation time regardless -
// this only keeps the labels honest, it isn't what enforces anything.
//
// Aligned to the wall-clock minute boundary rather than 60s after mount,
// so a shop closing at 21:00 updates a second or so later, not up to a
// minute later.
const MINUTE_MS = 60 * 1000;

export default function useOpenStatusRefresh(refetch) {
  // Kept in a ref so a refetch callback that changes identity every
  // render (most of them do) doesn't restart the timer each time.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      let interval;
      const startOfNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS) + 1000;
      const timeout = setTimeout(() => {
        refetchRef.current?.();
        interval = setInterval(() => refetchRef.current?.(), MINUTE_MS);
      }, startOfNextMinute);

      return () => {
        clearTimeout(timeout);
        if (interval) clearInterval(interval);
      };
    }, [])
  );
}
