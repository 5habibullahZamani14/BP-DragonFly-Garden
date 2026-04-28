/**
 * Order Status Constants and Enumerations
 * Defines valid order statuses and allowed transitions
 */

const ORDER_STATUS = {
  QUEUE: "queue",         // Order placed, waiting in the kitchen queue
  PREPARING: "preparing", // Order is being prepared by the kitchen
  READY: "ready"          // Order is done and ready to be served
};

/**
 * Valid status transitions
 * Maps current status to array of allowed next statuses
 */
const STATUS_TRANSITIONS = {
  [ORDER_STATUS.QUEUE]: [ORDER_STATUS.PREPARING],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: []
};

/**
 * Statuses visible to kitchen crew
 * Kitchen should monitor all active orders
 */
const KITCHEN_VISIBLE_STATUSES = [
  ORDER_STATUS.QUEUE,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY
];

/**
 * Statuses visible to customers/waiters
 */
const CUSTOMER_VISIBLE_STATUSES = [
  ORDER_STATUS.QUEUE,
  ORDER_STATUS.PREPARING,
  ORDER_STATUS.READY
];

/**
 * Get all valid statuses
 */
const ALL_STATUSES = Object.values(ORDER_STATUS);

/**
 * Check if a status transition is valid
 */
const isValidTransition = (currentStatus, nextStatus) => {
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions && allowedTransitions.includes(nextStatus);
};

/**
 * Get human-readable status description
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
