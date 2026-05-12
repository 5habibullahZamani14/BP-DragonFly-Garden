/*
 * order-status.js — Order status constants and lifecycle rules.
 *
 * I put all order status values in one place so that if the lifecycle ever
 * needs to change (e.g. adding a "dispatched" stage for delivery orders),
 * there is only one file to update. Controllers and middleware import from
 * here instead of using raw strings, which prevents typos from causing
 * silent failures in status comparisons.
 *
 * The lifecycle is linear: queue → preparing → ready.
 * An order cannot go backwards, and once it is ready, the kitchen crew
 * archives it rather than moving it to another status.
 */

const ORDER_STATUS = {
  QUEUE: "queue",         // Order placed, waiting in the kitchen queue
  PREPARING: "preparing", // Kitchen has started working on the order
  READY: "ready"          // Order is finished and ready to be served
};

/*
 * STATUS_TRANSITIONS maps each status to the statuses it is allowed to move to.
 * An empty array means no further transitions are possible from that state.
 * The updateOrderStatus controller validates against this map before accepting
 * a status change request.
 */
const STATUS_TRANSITIONS = {
  [ORDER_STATUS.QUEUE]: [ORDER_STATUS.PREPARING],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: []
};

/* All statuses the kitchen crew can see on their monitoring board. */
const KITCHEN_VISIBLE_STATUSES = [
  ORDER_STATUS.QUEUE,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY
];

/* All statuses a customer can see on their order tracker. */
const CUSTOMER_VISIBLE_STATUSES = [
  ORDER_STATUS.QUEUE,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY
];

/* A flat array of all valid status strings, useful for validation checks. */
const ALL_STATUSES = Object.values(ORDER_STATUS);

/*
 * isValidTransition checks whether moving from currentStatus to nextStatus
 * is allowed according to the lifecycle rules above. Returns false if
 * currentStatus has no defined transitions or nextStatus is not in the list.
 */
const isValidTransition = (currentStatus, nextStatus) => {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions && allowedTransitions.includes(nextStatus);
};

/*
 * getStatusDescription returns a human-readable string for each status,
 * intended for display in customer-facing messages and order history.
 */
const getStatusDescription = (status) => {
  const descriptions = {
    [ORDER_STATUS.QUEUE]: "Order received, waiting in the queue",
    [ORDER_STATUS.PREPARING]: "Your order is being prepared",
    [ORDER_STATUS.READY]: "Your order is ready to be served"
  };
  return descriptions[status] || status;
};

module.exports = {
  ORDER_STATUS,
  STATUS_TRANSITIONS,
  KITCHEN_VISIBLE_STATUSES,
  CUSTOMER_VISIBLE_STATUSES,
  ALL_STATUSES,
  isValidTransition,
  getStatusDescription
};
