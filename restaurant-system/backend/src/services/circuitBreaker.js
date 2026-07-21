/**
 * circuitBreaker.js — Circuit breaker pattern for external service calls.
 *
 * Provides resilience for external services (printer, cloud backup) by:
 * - Failing fast when services are unavailable
 * - Automatically recovering after timeout
 * - Logging failures for monitoring
 */

// Circuit breaker states
const STATE = {
  CLOSED: 'CLOSED',    // Normal operation - requests go through
  OPEN: 'OPEN',        // Service failed - fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing recovery - allow limited requests
};

// Default configuration
const DEFAULT_CONFIG = {
  failureThreshold: 3,     // Number of failures before opening circuit
  timeoutMs: 60000,        // Time to wait before trying again (60 seconds)
  resetTimeoutMs: 30000,   // Time to wait in half-open state (30 seconds)
  successThreshold: 2      // Number of successes to close circuit
};

class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Execute a function with circuit breaker protection.
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} - Result of the function
   * @throws {Error} - Circuit breaker error or original error
   */
  async execute(fn) {
    // Check if circuit is open
    if (this.state === STATE.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime < this.config.timeoutMs) {
        throw new Error(`[CircuitBreaker:${this.name}] Circuit is OPEN - service unavailable. Try again later.`);
      }
      // Transition to half-open
      this.state = STATE.HALF_OPEN;
      this.successCount = 0;
      console.log(`[CircuitBreaker:${this.name}] Circuit HALF-OPEN - testing recovery`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === STATE.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = STATE.CLOSED;
        this.successCount = 0;
        console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED - service recovered`);
      }
    }
  }

  onFailure(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === STATE.HALF_OPEN) {
      this.state = STATE.OPEN;
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN - recovery test failed`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = STATE.OPEN;
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN - threshold reached (${this.failureCount} failures)`);
    }
  }

  getState() {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Circuit breaker instances
const circuitBreakers = new Map();

/**
 * Get or create a circuit breaker for a service.
 * @param {string} name - Service name
 * @param {Object} config - Optional configuration
 * @returns {CircuitBreaker}
 */
const getCircuitBreaker = (name, config) => {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker(name, config));
  }
  return circuitBreakers.get(name);
};

/**
 * Wrap an async function with circuit breaker protection.
 * @param {string} serviceName - Name of the service
 * @param {Function} fn - Async function to wrap
 * @param {Object} config - Optional circuit breaker config
 * @returns {Function} - Wrapped function
 */
const withCircuitBreaker = (serviceName, fn, config) => {
  const breaker = getCircuitBreaker(serviceName, config);
  return (...args) => breaker.execute(() => fn(...args));
};

/**
 * Get all circuit breaker stats.
 * @returns {Object}
 */
const getAllStats = () => {
  const stats = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
};

module.exports = {
  CircuitBreaker,
  STATE,
  getCircuitBreaker,
  withCircuitBreaker,
  getAllStats
};