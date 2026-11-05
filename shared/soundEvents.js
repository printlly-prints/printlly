// Inputs are fetched server orders, never animation state or provider results.
const GENERIC_EVENTS = {
  ORDER_ACCEPTED: ["accepted", "ready_for_pickup", "completed"],
  ORDER_COMPLETED: ["completed"],
  ORDER_EXPIRED: ["expired"],
};

export function confirmedSoundEvent(event, order) {
  const orderId = String(order?._id || "");
  if (!orderId || String(event?.orderId || "") !== orderId) return null;
  let cue;
  if (event.event === "PAYMENT_CONFIRMED" && order.payment_status === "paid") {
    cue = "payment_confirmed";
  } else if (event.event === "ORDER_READY_FOR_PICKUP" && order.payment_status === "paid" && order.status === "ready_for_pickup") {
    cue = "ready_for_pickup";
  } else if (event.event === "ORDER_CANCELLED" && order.status === "cancelled") {
    // No current backend emits this event; provider dismissal never maps here.
    cue = "order_cancelled";
  } else if (GENERIC_EVENTS[event.event]?.includes(order.status)) {
    cue = "notification";
  } else if (event.event === "PAYMENT_FAILED" && order.payment_status === "failed") {
    cue = "notification";
  } else {
    return null;
  }
  // Socket, verified API response and push use one semantic identity.
  return { cue, key: `${orderId}:${event.event}` };
}

export function createSoundLedger({ initialKeys = [], limit = 256 } = {}) {
  const seen = new Set(initialKeys.slice(-limit));
  let playing = null;
  return {
    claim(confirmed, { enabled = true, foreground = true } = {}) {
      if (!confirmed || seen.has(confirmed.key)) return false;
      // Consume muted/background events too, so resume/unmute cannot replay them.
      seen.add(confirmed.key);
      while (seen.size > limit) seen.delete(seen.values().next().value);
      if (!enabled || !foreground) return false;
      // Specific cues replace generic playback; generic alerts never layer.
      if (confirmed.cue === "notification" && playing) return false;
      playing = confirmed.key;
      return true;
    },
    finish(key) { if (playing === key) playing = null; },
    interrupt() { playing = null; },
    keys() { return [...seen]; },
  };
}
