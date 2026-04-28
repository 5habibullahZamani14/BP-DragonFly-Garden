/**
 * Order Status Constants and Enumerations
 * Defines valid order statuses and allowed transitions
 */

const ORDER_STATUS = {
  PENDING: "pending",        // Order placed, waiting to be confirmed by kitchen
  CONFIRMED: "confirmed",    // Kitchen has confirmed receipt of order
  COOKING: "cooking",        // Order is being prepared
  READY: "ready",            // Order is ready for delivery
  COMPLETED: "completed"     // Order has been served to customer
};

/**
 * Valid status transitions
 * Maps current status to array of allowed next statuses
 */
const STATUS_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.COOKING, ORDER_STATUS.READY],
  [ORDER_STATUS.COOKING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: []
};

/**
 * Statuses visible to kitchen crew
 * Kitchen should monitor all active orders
 */
const KITCHEN_VISIBLE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.COOKING,
  ORDER_STATUS.READY
];

/**
 * Statuses visible to customers/waiters
 * Customers should see all statuses for their orders
 */
const CUSTOMER_VISIBLE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.COOKING,
  ORDER_STATUS.READY,
  ORDER_STATUS.COMPLETED
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
    [ORDER_STATUS.PENDING]: "Order received, awaiting kitchen confirmation",
    [ORDER_STATUS.CONFIRMED]: "Kitchen has confirmed, preparation will start soon",
    [ORDER_STATUS.COOKING]: "Your order is being prepared",
    [ORDER_STATUS.READY]: "Your order is ready for pickup",
    [ORDER_STATUS.COMPLETED]: "Order completed and served"
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
