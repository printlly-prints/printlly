import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

// Re-runs `poll` on a fixed interval while the screen is focused.
//
// Order status changes on the VENDOR's side (accepted, ready for pickup),
// and nothing pushes that to the app - so without this a customer only
// learns their order moved by pulling to refresh, which they have no
// reason to do at any particular moment. Polling makes the screen update
// on its own while they're actually looking at it.
//
// useFocusEffect, not useEffect: a screen sitting behind the current one
// in the stack shouldn't keep making requests.
export default function useFocusedPoll(poll, intervalMs) {
  // Ref so a callback that changes identity every render doesn't restart
  // the interval on each one.
  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => pollRef.current?.(), intervalMs);
      return () => clearInterval(interval);
    }, [intervalMs])
  );
}
