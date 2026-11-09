# UPI checkout

The mobile checkout keeps the shop, pickup contact and complete bill on one page. A compact wallet-icon UPI control sits to the left of Continue and opens a selection modal with Google Pay, PhonePe, Paytm, BHIM, other UPI apps and a gateway-generated UPI QR. There is no separate UPI summary strip or inline app grid. Card and wallet payment choices have been removed.

The modal is a native navigation form sheet on Android/iOS, with a focus-managed modal in the browser preview. Applying a choice returns to the same checkout without losing its documents, shop or bill; cancelling discards the draft choice. Existing unpaid orders use the same footer and picker on their payment-resume page. The seeded checkout completes directly from Continue, without an extra confirmation page, and retains an unpaid order for retry when the draft has not changed.

For live payments, the chosen option travels to the secure gateway. Razorpay's display configuration contains only UPI instruments, hides default blocks, places a selected app first and keeps other UPI/QR options available. A QR selection requests only the QR flow. No merchant VPA, QR, bank account, transaction reference or installed-app status is fabricated. The existing server-created amount and signature verification remain authoritative, including payment retries from Orders.

Sources:

- [Razorpay payment configuration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/understand-configuration)
- [Razorpay UPI intent and native WebView requirements](https://razorpay.com/docs/payments/payment-methods/upi/upi-intent)
- [UPI Collect deprecation guidance](https://raw.githubusercontent.com/razorpay/markdown-docs/master/payments/payment-methods/upi.md)
- Brand marks are bundled from Razorpay's CDN: `https://cdn.razorpay.com/app/{googlepay,phonepe,paytm,bhim}.svg`. PNG derivatives are in `userapp/assets/payments/`.

The current seeded build uses its existing isolated confirmation endpoint and does not open a UPI app or move money. Live UPI app handoff still needs Razorpay's native SDK/WebView bridge and device validation; the Expo Go WebView integration is not proof of functioning native UPI intent. Gateway-generated QR and app availability must be tested with the merchant account. No live payment was attempted during this UI work.

Validation: UPI configuration, navigation and seeded payment-isolation checks pass. Android export passes. Browser checks verified modal sizing, Escape cancellation preserving Google Pay, applying PhonePe, the complete ₹171 bill (₹128 + ₹32 + ₹8 + ₹3), and direct Continue → Order placed navigation without an intermediate confirmation page. No browser console errors were captured. Current screen previews are in `design/mobile-validation/final/checkout-and-upi-modal.png`.
