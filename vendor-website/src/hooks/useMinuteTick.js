import { useEffect, useState } from "react";

// Forces a re-render at each wall-clock minute boundary.
//
// Business-hours status (isWithinBusinessHours, utils/shopStatus.js) is
// computed from the CURRENT time during render, so without this a
// component showing it keeps whatever answer was true when it last
// rendered - the sidebar toggle would still read "Open for orders" for
// minutes or hours after the shop's closing time, until some unrelated
// state change happened to re-render it.
//
// Purely local: no request, no server state, just the clock moving.
const MINUTE_MS = 60 * 1000;

export default function useMinuteTick() {
  const [, setTick] = useState(0);

  useEffect(() => {
    let interval;
    // Aligned to the next minute boundary (plus a second of slack) rather
    // than 60s from mount, so 21:00 takes effect at 21:00, not up to a
    // minute later.
    const timeout = setTimeout(() => {
      setTick((n) => n + 1);
      interval = setInterval(() => setTick((n) => n + 1), MINUTE_MS);
    }, MINUTE_MS - (Date.now() % MINUTE_MS) + 1000);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
}
