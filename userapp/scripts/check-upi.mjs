import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/utils/upiPayments.js", import.meta.url),
  "utf8",
);
const { UPI_OPTIONS, upiOption, upiCheckoutDisplay } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

for (const option of UPI_OPTIONS) {
  const display = upiCheckoutDisplay(option.key);
  assert.equal(display.preferences.show_default_blocks, false);
  assert.deepEqual(
    display.sequence,
    Object.keys(display.blocks).map((key) => `block.${key}`),
  );
  for (const block of Object.values(display.blocks)) {
    assert(
      block.instruments.every((instrument) => instrument.method === "upi"),
    );
    assert(
      block.instruments.every(
        (instrument) => !instrument.flows.includes("collect"),
      ),
    );
  }
  if (!["other", "qr"].includes(option.key)) {
    assert.deepEqual(display.blocks.preferred.instruments[0].apps, [
      option.key,
    ]);
    assert.deepEqual(display.blocks.upi.instruments[0].flows, ["intent", "qr"]);
  }
}
assert.deepEqual(upiCheckoutDisplay("qr").blocks.upi.instruments, [
  { method: "upi", flows: ["qr"] },
]);
assert.equal(upiOption("card").key, "other");
assert.deepEqual(upiCheckoutDisplay("unexpected"), upiCheckoutDisplay("other"));
assert.deepEqual(upiCheckoutDisplay(undefined), upiCheckoutDisplay("other"));
console.log(
  "Passed: UPI-only checkout, named app selection, QR fallback and unknown-option handling.",
);
