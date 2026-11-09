// Shared order-detail routing for Orders and Notifications. In order:
//   1. Expired/cancelled -> OrderTracking, whatever payment_status says.
//      These can never be paid for (the backend refuses, and an expired
//      order's documents are already deleted); OrderTracking already
//      explains the expiry.
//   2. No verified payment yet -> back to checkout (no otp, nothing to
//      track - see PaymentScreen.js).
//   3. Ready for pickup -> the big OTP screen.
//   4. Anything else -> the general tracking view.
export const CLOSED_STATUSES = ["expired", "cancelled"];

export function isAwaitingPayment(order) {
  return Boolean(
    order.payment_status &&
      order.payment_status !== "paid" &&
      !CLOSED_STATUSES.includes(order.status),
  );
}

const LIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

// Most urgent first: ready to collect, then unpaid, then in progress.
export function pickLiveOrders(orders) {
  const rank = (order) =>
    order.status === "ready_for_pickup" ? 0 : isAwaitingPayment(order) ? 1 : 2;
  return orders
    .filter((order) => LIVE_STATUSES.includes(order.status))
    .sort((a, b) => rank(a) - rank(b));
}

export function navigateToOrder(navigation, order) {
  if (CLOSED_STATUSES.includes(order.status)) {
    navigation.navigate("OrderTracking", { order });
    return;
  }

  if (isAwaitingPayment(order)) {
    // Resumes/retries payment for this exact order rather than creating a
    // new one - PaymentScreen only ever pays for an order_id it's given,
    // it never creates one itself (see CheckoutScreen, which is the
    // only place that does). The breakdown mirrors what
    // CheckoutScreen would have shown, built from the order's own
    // stored itemized fields since there's nothing left to recompute here.
    navigation.navigate("PrintFlow", {
      screen: "Payment",
      params: {
        orderId: order._id,
        estimatedAmount: order.total_amount,
        shopName: order.shop_id?.shop_name,
        documentCount: order.documents?.length,
        breakdown: {
          subtotal: order.base_subtotal,
          paperSize: order.paper_size_charge,
          sides: order.sides_charge,
          services: order.services_charge,
          platformFee: order.platform_fee,
          total: order.total_amount,
        },
      },
    });
    return;
  }

  if (order.status === "ready_for_pickup") {
    navigation.navigate("PickupOtp", { order });
  } else {
    navigation.navigate("OrderTracking", { order });
  }
}
