// The backend groups preparation with accepted; it has no separate printer-start event.
export function orderJourney(status) {
  if (status === "completed")
    return {
      stage: 2,
      art: "ready",
      title: "Collected",
      description: "Your order is complete.",
    };
  if (status === "ready_for_pickup")
    return {
      stage: 2,
      art: "ready",
      title: "Ready to collect",
      description: "Your prints are waiting at the shop.",
    };
  if (status === "accepted" || status === "printing")
    return {
      stage: 1,
      art: "printing",
      title: "Preparing your prints",
      description: "The shop has accepted your order.",
    };
  return {
    stage: -1,
    art: "accepted",
    title: "Waiting for the shop",
    description: "Your order has been sent for acceptance.",
  };
}
