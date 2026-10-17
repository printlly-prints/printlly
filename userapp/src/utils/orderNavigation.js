// Shared routing rule for "tap on an order", used by HomeScreen,
// MyOrdersScreen and NotificationsScreen so they stay consistent. In order:
//   1. Expired/cancelled -> OrderTracking, whatever payment_status says.
//      These can never be paid for (the backend refuses, and an expired
//      order's documents are already deleted); OrderTracking already
//      explains the expiry.
//   2. No verified payment yet -> back to checkout (no otp, nothing to
//      track - see PaymentScreen.js).
//   3. Ready for pickup -> the big OTP screen.
//   4. Anything else -> the general tracking view.
import { pickupCodeForOrder } from "./orderState.js";

export const CLOSED_STATUSES = ["expired", "cancelled"];

export function isAwaitingPayment(order) {
  return Boolean(
    order.payment_status && order.payment_status !== "paid" && !CLOSED_STATUSES.includes(order.status)
  );
}

export function navigateToOrder(navigation, order) {
  if (CLOSED_STATUSES.includes(order.status)) {
    navigation.navigate("OrderTracking", { order });
    return;
  }

  if (isAwaitingPayment(order)) {
    // Resumes/retries payment for this exact order rather than creating a
    // new one - PaymentScreen only ever pays for an order_id it's given,
    // it never creates one itself (see ReviewCheckoutScreen, which is the
    // only place that does). The breakdown mirrors what
    // ReviewCheckoutScreen would have shown, built from the order's own
    // stored itemized fields since there's nothing left to recompute here.
    navigation.navigate("Payment", {
      orderId: order._id,
      estimatedAmount: order.total_amount,
      breakdown: {
        subtotal: order.base_subtotal,
        platformFee: order.platform_fee,
        total: order.total_amount,
      },
    });
    return;
  }

  if (order.status === "ready_for_pickup" && pickupCodeForOrder(order)) {
    navigation.navigate("PickupOtp", { order });
  } else {
    navigation.navigate("OrderTracking", { order });
  }
}
