export const UPI_OPTIONS = [
  { key: "google_pay", title: "Google Pay", note: "Pay with Google Pay" },
  { key: "phonepe", title: "PhonePe", note: "Pay with PhonePe" },
  { key: "paytm", title: "Paytm", note: "Pay with Paytm UPI" },
  { key: "bhim", title: "BHIM", note: "Pay with BHIM UPI" },
  {
    key: "other",
    title: "Other UPI apps",
    note: "Choose an app in secure checkout",
  },
  { key: "qr", title: "Scan a UPI QR", note: "Scan using any UPI app" },
];

export function upiOption(key) {
  return UPI_OPTIONS.find((option) => option.key === key) || UPI_OPTIONS[4];
}

// Gateway configuration only; Razorpay generates the actual payment QR/intent.
export function upiCheckoutDisplay(key) {
  const selected = upiOption(key);
  const blocks = {};
  const sequence = [];
  if (!["other", "qr"].includes(selected.key)) {
    blocks.preferred = {
      name: selected.title,
      instruments: [{ method: "upi", flows: ["intent"], apps: [selected.key] }],
    };
    sequence.push("block.preferred");
  }
  blocks.upi = {
    name: selected.key === "qr" ? "Scan a UPI QR" : "UPI apps & QR",
    instruments: [
      {
        method: "upi",
        flows: selected.key === "qr" ? ["qr"] : ["intent", "qr"],
      },
    ],
  };
  sequence.push("block.upi");
  return { blocks, sequence, preferences: { show_default_blocks: false } };
}
