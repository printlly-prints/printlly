import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function moduleFromSource(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
}
const { confirmationState, finishPrintFlow } = await moduleFromSource(
  "../src/utils/confirmationNavigation.js",
);
const { navigateToOrder, pickLiveOrders } = await moduleFromSource(
  "../src/utils/orderNavigation.js",
);
const { greetingForHour } = await moduleFromSource("../src/utils/greeting.js");
assert.equal(greetingForHour(11), "Good morning");
assert.equal(greetingForHour(12), "Good afternoon");
assert.equal(greetingForHour(17), "Good evening");
const tabState = {
  index: 1,
  routes: [
    { name: "Home" },
    {
      name: "Shops",
      state: {
        index: 1,
        routes: [
          { name: "ShopList" },
          { name: "ShopDetails", params: { shop: { _id: "shop" } } },
        ],
      },
    },
  ],
};
const order = { _id: "paid-order", payment_status: "paid", status: "accepted" };
const state = {
  routes: [
    { key: "main-key", name: "MainTabs", state: tabState },
    { name: "PrintFlow" },
  ],
};
const confirmation = confirmationState(state, order);
assert.equal(confirmation.routes[0].key, "main-key");
assert.strictEqual(
  confirmation.routes[0].state,
  tabState,
  "payment must preserve the selected tab and its navigation history",
);
assert.equal(confirmation.routes[0].params.completedOrderId, order._id);
assert.equal(confirmation.routes[1].name, "OrderPlaced");
assert.ok(
  !confirmation.routes.some((route) => route.name === "PrintFlow"),
  "spent checkout must be removed",
);
assert.equal(state.routes.length, 2, "input state must remain unchanged");
let reset;
const root = { getState: () => state, reset: (value) => (reset = value) };
finishPrintFlow(
  {
    getParent: (id) => {
      assert.equal(id, "Root");
      return root;
    },
  },
  order,
);
assert.deepEqual(reset, confirmation);
const calls = [];
const navigation = { navigate: (...args) => calls.push(args) };
navigateToOrder(navigation, { ...order, status: "ready_for_pickup" });
assert.equal(calls.pop()[0], "PickupOtp");
navigateToOrder(navigation, { ...order, payment_status: "pending" });
const pending = calls.pop();
assert.equal(pending[0], "PrintFlow");
assert.equal(pending[1].screen, "Payment");
assert.equal(pending[1].params.orderId, order._id);
navigateToOrder(navigation, {
  ...order,
  status: "cancelled",
  payment_status: "pending",
});
assert.equal(
  calls.pop()[0],
  "OrderTracking",
  "closed orders must not resume payment",
);
assert.deepEqual(
  pickLiveOrders([
    { _id: "printing", status: "accepted", payment_status: "paid" },
    { _id: "done", status: "completed", payment_status: "paid" },
    { _id: "unpaid", status: "pending", payment_status: "pending" },
    { _id: "ready", status: "ready_for_pickup", payment_status: "paid" },
  ]).map((liveOrder) => liveOrder._id),
  ["ready", "unpaid", "printing"],
  "Home must surface the most urgent live order first",
);
const { quoteTags } = await moduleFromSource(
  "../src/utils/quoteSelection.js",
);
assert.deepEqual(
  quoteTags([
    { shop_id: "a", total_amount: 15, distance_km: 0.9 },
    { shop_id: "b", total_amount: 19, distance_km: 0.4 },
    { shop_id: "c", total_amount: 10, distance_km: 0.1, shop_status: "closed" },
  ]),
  { a: ["Cheapest"], b: ["Closest"] },
  "closed shops must not win a comparison tag",
);
assert.deepEqual(
  quoteTags([
    { shop_id: "a", total_amount: 15 },
    { shop_id: "b", total_amount: 15 },
  ]),
  {},
  "ties and missing distances must not earn a tag",
);
console.log(
  "Passed: independent tab history, checkout cleanup and contextual order navigation.",
);
