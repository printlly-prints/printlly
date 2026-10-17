export function upiCheckoutOptions({ amountInPaise, currency, razorpayOrderId, keyId, user, actionColor }) {
  return {
    key: keyId, amount: amountInPaise, currency, order_id: razorpayOrderId,
    name: "Printlly", description: "Payment for your print order",
    prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone || "", method: "upi" },
    config: { display: { blocks: { upi: { name: "Pay with UPI", instruments: [{ method: "upi" }] } }, sequence: ["block.upi"], preferences: { show_default_blocks: false } } },
    // Provider-owned Intent/QR only. UPI Collect is deprecated for normal
    // Android merchants; no VPA input or invented merchant QR is rendered.
    webview_intent: true, theme: { color: actionColor },
  };
}
export function upiIntentUrl(url) {
  if (/^upi:\/\/pay(?:\?|$)/i.test(url)) return url;
  if (!url.startsWith("intent://")) return null;
  const marker = url.indexOf("#Intent;");
  if (marker < 0) return null;
  const params = url.slice(marker + 8).split(";"), scheme = params.find((part) => part.startsWith("scheme="))?.slice(7);
  if (scheme !== "upi") return null;
  const converted = `upi://${url.slice(9, marker)}`;
  return /^upi:\/\/pay(?:\?|$)/i.test(converted) ? converted : null;
}
