/**
 * @fileoverview Circuit breaker pattern implementation for fault tolerance
 * @module @relay/circuit-breaker
 *
 * This package provides a circuit breaker implementation for handling failures
 * in external service calls. It prevents cascading failures and allows systems
 * to recover gracefully.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failures exceeded threshold, requests are rejected
 * - HALF_OPEN: Testing if service has recovered
 *
 * @example
 * ```typescript
 * import { CircuitBreaker, circuitBreakers, withCircuit } from '@relay/circuit-breaker';
 *
 * // Get or create a circuit breaker
 * const breaker = circuitBreakers.get('payment-api', {
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 * });
 *
 * // Execute through circuit breaker
 * const result = await breaker.execute(() => paymentApi.charge(amount));
 *
 * // Or use the wrapper function
 * const safeCharge = withCircuit(
 *   (amount: number) => paymentApi.charge(amount),
 *   'payment-api'
 * );
 * ```
 */

// ============================================================================
// Types & Enums
// ============================================================================

/**
 * Circuit breaker states.
 */
export enum CircuitState {
  /** Circuit is closed, requests flow normally */
  CLOSED = 'CLOSED',
  /** Circuit is open, requests are rejected */
  OPEN = 'OPEN',
  /** Circuit is testing if the service has recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration options.
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Number of successes in half-open state to close the circuit (default: 2) */
  successThreshold?: number;
  /** Time in ms to wait before moving from open to half-open (default: 30000) */
  resetTimeout?: number;
  /** Time window in ms to track failures (default: 60000) */
  failureWindow?: number;
  /** Timeout for individual requests in ms (default: 10000) */
  requestTimeout?: number;
  /** Function to determine if an error should count as a failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when circuit state changes */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;
  /** Callback when a request fails */
  onFailure?: (error: Error) => void;
  /** Callback when a request succeeds */
  onSuccess?: () => void;
  /** Fallback function when circuit is open */
  fallback?: <T>() => T | Promise<T>;
}

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  /** Current circuit state */
  state: CircuitState;
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Number of rejected requests (circuit open) */
  rejectedRequests: number;
  /** Number of times the circuit has opened */
  timesOpened: number;
  /** Last failure timestamp */
  lastFailureTime: number | null;
  /** Last success timestamp */
  lastSuccessTime: number | null;
  /** Failure rate percentage */
  failureRate: number;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Error thrown when the circuit is open.
 */
export class CircuitOpenError extends Error {
  /**
   * Time when the circuit will attempt to reset.
   */
  readonly resetTime?: number;

  constructor(message = 'Circuit breaker is open', resetTime?: number) {
    super(message);
    this.name = 'CircuitOpenError';
    this.resetTime = resetTime;
  }
}

/**
 * Error thrown when a request times out.
 */
export class CircuitTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'CircuitTimeoutError';
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: Required<
  Omit<
    CircuitBreakerOptions,
    'onStateChange' | 'onFailure' | 'onSuccess' | 'fallback'
  >
> = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 30000,
  failureWindow: 60000,
  requestTimeout: 10000,
  isFailure: () => true,
};

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit Breaker implementation for fault-tolerant service calls.
 *
 * Wraps external service calls and provides fault tolerance by:
 * - Tracking failure rates within a time window
 * - Opening the circuit when failures exceed threshold
 * - Periodically testing if the service has recovered
 * - Closing the circuit when service is healthy again
 */
export class CircuitBreaker {
  /** Circuit breaker name for identification */
  private readonly name: string;

  /** Configuration options */
  private readonly options: Required<
    Omit<
      CircuitBreakerOptions,
      'onStateChange' | 'onFailure' | 'onSuccess' | 'fallback'
    >
  > &
    CircuitBreakerOptions;

  /** Current circuit state */
  private state: CircuitState = CircuitState.CLOSED;

  /** Timestamps of recent failures */
  private failures: number[] = [];

  /** Count of successes in half-open state */
  private halfOpenSuccesses = 0;

  /** Timestamp when the circuit was opened */
  private openedAt: number | null = null;

  /** Statistics tracking */
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rejectedRequests: 0,
    timesOpened: 0,
    lastFailureTime: null as number | null,
    lastSuccessTime: null as number | null,
  };

  /**
   * Creates a new CircuitBreaker instance.
   *
   * @param name - Name for identifying this circuit breaker
   * @param options - Configuration options
   */
  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Executes a function through the circuit breaker.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws CircuitOpenError if the circuit is open
   * @throws CircuitTimeoutError if the request times out
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check if circuit should transition from open to half-open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.stats.rejectedRequests++;
        if (this.options.fallback) {
          return this.options.fallback<T>();
        }
        throw new CircuitOpenError(
          `Circuit breaker '${this.name}' is open`,
          this.openedAt
            ? this.openedAt + this.options.resetTimeout
            : undefined
        );
      }
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.handleSuccess();
      return result;
    } catch (error) {
      this.handleFailure(error as Error);
      throw error;
    }
  }

  /**
   * Gets the current circuit state.
   *
   * @returns Current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Gets the circuit breaker name.
   *
   * @returns Circuit breaker name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Gets circuit breaker statistics.
   *
   * @returns Circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const total = this.stats.successfulRequests + this.stats.failedRequests;
    return {
      state: this.state,
      totalRequests: this.stats.totalRequests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      rejectedRequests: this.stats.rejectedRequests,
      timesOpened: this.stats.timesOpened,
      lastFailureTime: this.stats.lastFailureTime,
      lastSuccessTime: this.stats.lastSuccessTime,
      failureRate: total > 0 ? (this.stats.failedRequests / total) * 100 : 0,
    };
  }

  /**
   * Manually resets the circuit breaker to closed state.
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failures = [];
    this.halfOpenSuccesses = 0;
    this.openedAt = null;
  }

  /**
   * Forces the circuit breaker to open state.
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
    this.openedAt = Date.now();
  }

  /**
   * Checks if the circuit breaker allows requests.
   *
   * @returns True if requests are allowed
   */
  isAllowed(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      return this.shouldAttemptReset();
    }

    return true; // HALF_OPEN allows requests
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new CircuitTimeoutError(
            `Request timed out after ${this.options.requestTimeout}ms`
          )
        );
      }, this.options.requestTimeout);

      fn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private handleSuccess(): void {
    this.stats.successfulRequests++;
    this.stats.lastSuccessTime = Date.now();
    this.options.onSuccess?.();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.halfOpenSuccesses = 0;
        this.failures = [];
        this.openedAt = null;
      }
    }
  }

  private handleFailure(error: Error): void {
    // Check if this error should count as a failure
    if (!this.options.isFailure(error)) {
      return;
    }

    this.stats.failedRequests++;
    this.stats.lastFailureTime = Date.now();
    this.options.onFailure?.(error);

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
      this.openedAt = Date.now();
      this.halfOpenSuccesses = 0;
      return;
    }

    // Record failure timestamp
    const now = Date.now();
    this.failures.push(now);

    // Remove failures outside the window
    const windowStart = now - this.options.failureWindow;
    this.failures = this.failures.filter((f) => f > windowStart);

    // Check if threshold exceeded
    if (this.failures.length >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
      this.openedAt = now;
      this.stats.timesOpened++;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.openedAt) {
      return false;
    }
    return Date.now() - this.openedAt >= this.options.resetTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    if (previousState === newState) {
      return;
    }

    this.state = newState;
    this.options.onStateChange?.(newState, previousState);
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

/**
 * Registry of circuit breakers for different services.
 */
class CircuitBreakerRegistry {
  /** Map of circuit breakers by name */
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Gets or creates a circuit breaker for a service.
   *
   * @param name - Service name
   * @param options - Configuration options (only used if creating new)
   * @returns Circuit breaker instance
   */
  get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Checks if a circuit breaker exists.
   *
   * @param name - Service name
   * @returns True if exists
   */
  has(name: string): boolean {
    return this.breakers.has(name);
  }

  /**
   * Removes a circuit breaker.
   *
   * @param name - Service name
   * @returns True if removed
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Gets all circuit breakers.
   *
   * @returns Map of all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Gets statistics for all circuit breakers.
   *
   * @returns Map of statistics by name
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [name, breaker] of this.breakers) {
      stats.set(name, breaker.getStats());
    }
    return stats;
  }

  /**
   * Resets all circuit breakers.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clears all circuit breakers from the registry.
   */
  clear(): void {
    this.breakers.clear();
  }
}

/**
 * Global circuit breaker registry.
 */
export const circuitBreakers = new CircuitBreakerRegistry();

// ============================================================================
// Pre-configured Circuit Breakers
// ============================================================================

/**
 * Pre-configured circuit breakers for common services.
 */
export const Circuits = {
  /** OpenAI API circuit breaker */
  OPENAI: circuitBreakers.get('openai', {
    failureThreshold: 3,
    resetTimeout: 60000,
    requestTimeout: 30000,
  }),

  /** Anthropic API circuit breaker */
  ANTHROPIC: circuitBreakers.get('anthropic', {
    failureThreshold: 3,
    resetTimeout: 60000,
    requestTimeout: 30000,
  }),

  /** Google AI API circuit breaker */
  GOOGLE: circuitBreakers.get('google', {
    failureThreshold: 3,
    resetTimeout: 60000,
    requestTimeout: 30000,
  }),

  /** Stripe API circuit breaker */
  STRIPE: circuitBreakers.get('stripe', {
    failureThreshold: 5,
    resetTimeout: 30000,
    requestTimeout: 15000,
  }),

  /** MongoDB circuit breaker */
  MONGODB: circuitBreakers.get('mongodb', {
    failureThreshold: 5,
    resetTimeout: 10000,
    requestTimeout: 5000,
  }),

  /** External integrations circuit breaker */
  INTEGRATIONS: circuitBreakers.get('integrations', {
    failureThreshold: 5,
    resetTimeout: 30000,
    requestTimeout: 20000,
  }),
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Decorator to wrap a method with circuit breaker protection.
 *
 * @param circuitName - Name of the circuit breaker
 * @param options - Circuit breaker options
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class PaymentService {
 *   @withCircuitBreaker('stripe')
 *   async charge(amount: number): Promise<ChargeResult> {
 *     return await stripeApi.charge(amount);
 *   }
 * }
 * ```
 */
export function withCircuitBreaker(
  circuitName: string,
  options?: CircuitBreakerOptions
) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const breaker = circuitBreakers.get(circuitName, options);

    descriptor.value = async function (...args: unknown[]) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Wraps an async function with circuit breaker protection.
 *
 * @param fn - Function to wrap
 * @param circuitName - Name of the circuit breaker
 * @param options - Circuit breaker options
 * @returns Wrapped function
 *
 * @example
 * ```typescript
 * const safeCharge = withCircuit(
 *   (amount: number) => stripeApi.charge(amount),
 *   'stripe'
 * );
 *
 * const result = await safeCharge(100);
 * ```
 */
export function withCircuit<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  circuitName: string,
  options?: CircuitBreakerOptions
): (...args: TArgs) => Promise<TResult> {
  const breaker = circuitBreakers.get(circuitName, options);

  return async (...args: TArgs): Promise<TResult> => {
    return breaker.execute(() => fn(...args));
  };
}

/**
 * Creates a function that retries with exponential backoff.
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Wrapped function with retry logic
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(
 *   () => fetch('/api/data'),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 * ```
 */
export function withRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): (...args: TArgs) => Promise<TResult> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
    onRetry,
  } = options;

  return async (...args: TArgs): Promise<TResult> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries && shouldRetry(lastError, attempt)) {
          onRetry?.(lastError, attempt);
          const delay = Math.min(
            baseDelay * Math.pow(backoffFactor, attempt),
            maxDelay
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  };
}

/**
 * Combines circuit breaker with retry logic.
 *
 * @param fn - Function to protect
 * @param circuitName - Circuit breaker name
 * @param options - Combined options
 * @returns Protected function
 */
export function withCircuitAndRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  circuitName: string,
  options?: CircuitBreakerOptions & {
    maxRetries?: number;
    baseDelay?: number;
  }
): (...args: TArgs) => Promise<TResult> {
  const circuitProtected = withCircuit(fn, circuitName, options);
  return withRetry(circuitProtected, {
    maxRetries: options?.maxRetries ?? 2,
    baseDelay: options?.baseDelay ?? 1000,
    shouldRetry: (error) => !(error instanceof CircuitOpenError),
  });
}

// ============================================================================
// Default Export
// ============================================================================

export default CircuitBreaker;
