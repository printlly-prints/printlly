// Clear the spent checkout without changing the customer's selected tab or its history.
export function confirmationState(state, order) {
  const main = state.routes.find((route) => route.name === "MainTabs");
  return {
    index: 1,
    routes: [
      {
        ...(main || { name: "MainTabs" }),
        params: { ...main?.params, completedOrderId: order._id },
      },
      { name: "OrderPlaced", params: { order } },
    ],
  };
}

export function finishPrintFlow(navigation, order) {
  const root = navigation.getParent?.("Root") || navigation;
  root.reset(confirmationState(root.getState(), order));
}
