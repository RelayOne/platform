/**
 * @fileoverview Rate limit recovery system with exponential backoff, circuit breaker, and intelligent retry strategies.
 * Provides automatic recovery from rate limit errors across all tracker integrations.
 * @packageDocumentation
 */

import { TrackerProvider } from './types';

/**
 * Recovery strategy to use when rate limited.
 */
export type RecoveryStrategy =
  | 'wait' // Wait for rate limit to reset
  | 'reduce_batch' // Reduce batch size and retry
  | 'use_cache' // Fall back to cached data
  | 'skip'; // Skip operation

/**
 * Circuit breaker state.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Rate limit recovery configuration.
 */
export interface RateLimitRecoveryConfig {
  /** Base delay for exponential backoff in milliseconds */
  baseDelayMs: number;
  /** Maximum delay for exponential backoff in milliseconds */
  maxDelayMs: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Maximum jitter as percentage of delay (0-1) */
  jitterFactor: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker timeout in milliseconds */
  circuitBreakerTimeoutMs: number;
  /** Default recovery strategy */
  defaultStrategy: RecoveryStrategy;
  /** Enable automatic queue processing */
  enableQueueProcessing: boolean;
  /** Maximum retry queue size */
  maxQueueSize: number;
}

/**
 * Rate limit state for a provider.
 */
export interface ProviderRateLimitState {
  /** Provider identifier */
  provider: TrackerProvider;
  /** Remaining requests */
  remaining: number;
  /** Total limit */
  limit: number;
  /** Reset timestamp */
  resetAt: Date;
  /** Current circuit breaker state */
  circuitState: CircuitState;
  /** Circuit breaker failure count */
  failureCount: number;
  /** Last failure timestamp */
  lastFailureAt?: Date;
  /** Retry queue */
  retryQueue: RetryQueueItem[];
}

/**
 * Item in the retry queue.
 */
export interface RetryQueueItem {
  /** Unique identifier */
  id: string;
  /** Provider */
  provider: TrackerProvider;
  /** Operation to retry */
  operation: () => Promise<unknown>;
  /** Current attempt number */
  attempt: number;
  /** Next retry timestamp */
  nextRetryAt: Date;
  /** Original error */
  error: Error;
  /** Context data */
  context: Record<string, unknown>;
  /** Resolve callback */
  resolve: (value: unknown) => void;
  /** Reject callback */
  reject: (error: Error) => void;
}

/**
 * Rate limit error details.
 */
export interface RateLimitErrorDetails {
  /** Provider that hit rate limit */
  provider: TrackerProvider;
  /** Retry after duration in milliseconds */
  retryAfterMs: number;
  /** Remaining requests (if known) */
  remaining?: number;
  /** Rate limit reset time */
  resetAt?: Date;
}

/**
 * Default recovery configuration.
 */
const DEFAULT_CONFIG: RateLimitRecoveryConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  maxRetries: 5,
  jitterFactor: 0.3,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeoutMs: 60000,
  defaultStrategy: 'wait',
  enableQueueProcessing: true,
  maxQueueSize: 1000,
};

/**
 * Rate limit recovery system with circuit breaker pattern.
 * Automatically handles rate limit errors and retries with exponential backoff.
 *
 * @example
 * ```typescript
 * const recovery = new RateLimitRecoverySystem();
 *
 * // Execute operation with automatic recovery
 * const result = await recovery.executeWithRecovery(
 *   'linear',
 *   async () => await client.listTasks(projectId),
 *   { context: { projectId } }
 * );
 *
 * // Handle rate limit error
 * try {
 *   await client.makeRequest();
 * } catch (error) {
 *   if (recovery.isRateLimitError(error)) {
 *     await recovery.handleRateLimitError('linear', error);
 *   }
 * }
 * ```
 */
export class RateLimitRecoverySystem {
  private config: RateLimitRecoveryConfig;
  private providerStates: Map<TrackerProvider, ProviderRateLimitState>;
  private queueProcessingIntervals: Map<TrackerProvider, NodeJS.Timeout>;

  /**
   * Creates a new rate limit recovery system.
   * @param config - Recovery configuration
   */
  constructor(config: Partial<RateLimitRecoveryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.providerStates = new Map();
    this.queueProcessingIntervals = new Map();
  }

  /**
   * Execute an operation with automatic rate limit recovery.
   *
   * @param provider - Tracker provider
   * @param operation - Async operation to execute
   * @param options - Execution options
   * @returns Operation result
   * @throws Error if operation fails after all retries
   */
  async executeWithRecovery<T>(
    provider: TrackerProvider,
    operation: () => Promise<T>,
    options: {
      strategy?: RecoveryStrategy;
      context?: Record<string, unknown>;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const state = this.getOrCreateState(provider);
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const strategy = options.strategy ?? this.config.defaultStrategy;

    // Check circuit breaker
    if (state.circuitState === 'open') {
      throw new CircuitBreakerOpenError(
        `Circuit breaker open for ${provider}`,
        provider
      );
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute operation
        const result = await operation();

        // Reset circuit breaker on success
        if (attempt > 0) {
          this.resetCircuitBreaker(provider);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if this is a rate limit error
        if (this.isRateLimitError(error)) {
          const details = this.extractRateLimitDetails(provider, error);
          await this.handleRateLimitError(provider, details, strategy);

          // Calculate backoff delay
          if (attempt < maxRetries) {
            const delay = this.calculateBackoffDelay(attempt, details.retryAfterMs);
            await this.sleep(delay);
          }
        } else {
          // Non-rate-limit error, increment circuit breaker
          this.incrementCircuitBreaker(provider);
          throw error;
        }
      }
    }

    // All retries exhausted
    this.incrementCircuitBreaker(provider);
    throw new MaxRetriesExceededError(
      `Max retries (${maxRetries}) exceeded for ${provider}`,
      provider,
      lastError
    );
  }

  /**
   * Handle a rate limit error.
   *
   * @param provider - Tracker provider
   * @param details - Rate limit error details
   * @param strategy - Recovery strategy to use
   */
  async handleRateLimitError(
    provider: TrackerProvider,
    details: RateLimitErrorDetails,
    strategy: RecoveryStrategy = this.config.defaultStrategy
  ): Promise<void> {
    const state = this.getOrCreateState(provider);

    // Update rate limit state
    if (details.remaining !== undefined) {
      state.remaining = details.remaining;
    }
    if (details.resetAt) {
      state.resetAt = details.resetAt;
    }

    // Increment failure count
    state.failureCount++;
    state.lastFailureAt = new Date();

    // Check circuit breaker threshold
    if (state.failureCount >= this.config.circuitBreakerThreshold) {
      this.openCircuitBreaker(provider);
    }

    // Execute recovery strategy
    switch (strategy) {
      case 'wait':
        // Wait handled by backoff delay
        break;
      case 'reduce_batch':
        // Caller should handle batch size reduction
        break;
      case 'use_cache':
        // Caller should fall back to cache
        break;
      case 'skip':
        // Skip operation
        break;
    }
  }

  /**
   * Queue an operation for retry.
   *
   * @param provider - Tracker provider
   * @param operation - Operation to retry
   * @param context - Context data
   * @returns Promise that resolves when operation succeeds
   */
  async queueForRetry<T>(
    provider: TrackerProvider,
    operation: () => Promise<T>,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    const state = this.getOrCreateState(provider);

    if (state.retryQueue.length >= this.config.maxQueueSize) {
      throw new QueueFullError(
        `Retry queue full for ${provider} (max: ${this.config.maxQueueSize})`,
        provider
      );
    }

    return new Promise<T>((resolve, reject) => {
      const item: RetryQueueItem = {
        id: this.generateId(),
        provider,
        operation: operation as () => Promise<unknown>,
        attempt: 0,
        nextRetryAt: new Date(Date.now() + this.config.baseDelayMs),
        error: new Error('Queued for retry'),
        context,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      state.retryQueue.push(item);

      // Start queue processing if not already running
      if (!this.queueProcessingIntervals.has(provider)) {
        this.startQueueProcessing(provider);
      }
    });
  }

  /**
   * Update rate limit state from API response.
   *
   * @param provider - Tracker provider
   * @param remaining - Remaining requests
   * @param limit - Total limit
   * @param resetAt - Reset timestamp
   */
  updateRateLimitState(
    provider: TrackerProvider,
    remaining: number,
    limit: number,
    resetAt: Date
  ): void {
    const state = this.getOrCreateState(provider);
    state.remaining = remaining;
    state.limit = limit;
    state.resetAt = resetAt;

    // Reset circuit breaker if rate limit is healthy
    if (remaining > limit * 0.5) {
      this.resetCircuitBreaker(provider);
    }
  }

  /**
   * Get rate limit state for a provider.
   *
   * @param provider - Tracker provider
   * @returns Rate limit state
   */
  getProviderState(provider: TrackerProvider): ProviderRateLimitState {
    return this.getOrCreateState(provider);
  }

  /**
   * Check if error is a rate limit error.
   *
   * @param error - Error to check
   * @returns True if rate limit error
   */
  isRateLimitError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return (
      name.includes('ratelimit') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('429') ||
      (error as { statusCode?: number }).statusCode === 429
    );
  }

  /**
   * Extract rate limit details from error.
   *
   * @param provider - Tracker provider
   * @param error - Rate limit error
   * @returns Rate limit details
   */
  private extractRateLimitDetails(
    provider: TrackerProvider,
    error: unknown
  ): RateLimitErrorDetails {
    const errorObj = error as {
      retryAfter?: number;
      retryAfterMs?: number;
      remaining?: number;
      resetAt?: Date | string;
    };

    let retryAfterMs = errorObj.retryAfter || errorObj.retryAfterMs || this.config.baseDelayMs;

    // Convert seconds to milliseconds if needed
    if (retryAfterMs < 1000) {
      retryAfterMs *= 1000;
    }

    let resetAt: Date | undefined;
    if (errorObj.resetAt) {
      resetAt = typeof errorObj.resetAt === 'string'
        ? new Date(errorObj.resetAt)
        : errorObj.resetAt;
    }

    return {
      provider,
      retryAfterMs,
      remaining: errorObj.remaining,
      resetAt,
    };
  }

  /**
   * Calculate exponential backoff delay with jitter.
   *
   * @param attempt - Current attempt number
   * @param baseDelay - Base delay in milliseconds
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(attempt: number, baseDelay?: number): number {
    const base = baseDelay || this.config.baseDelayMs;
    const exponentialDelay = base * Math.pow(2, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // Add jitter
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Get or create provider state.
   *
   * @param provider - Tracker provider
   * @returns Provider state
   */
  private getOrCreateState(provider: TrackerProvider): ProviderRateLimitState {
    if (!this.providerStates.has(provider)) {
      this.providerStates.set(provider, {
        provider,
        remaining: 1000,
        limit: 1000,
        resetAt: new Date(Date.now() + 60000),
        circuitState: 'closed',
        failureCount: 0,
        retryQueue: [],
      });
    }
    return this.providerStates.get(provider)!;
  }

  /**
   * Open circuit breaker for a provider.
   *
   * @param provider - Tracker provider
   */
  private openCircuitBreaker(provider: TrackerProvider): void {
    const state = this.getOrCreateState(provider);
    state.circuitState = 'open';

    // Schedule circuit breaker timeout
    setTimeout(() => {
      state.circuitState = 'half_open';
    }, this.config.circuitBreakerTimeoutMs);
  }

  /**
   * Reset circuit breaker for a provider.
   *
   * @param provider - Tracker provider
   */
  private resetCircuitBreaker(provider: TrackerProvider): void {
    const state = this.getOrCreateState(provider);
    state.circuitState = 'closed';
    state.failureCount = 0;
  }

  /**
   * Increment circuit breaker failure count.
   *
   * @param provider - Tracker provider
   */
  private incrementCircuitBreaker(provider: TrackerProvider): void {
    const state = this.getOrCreateState(provider);
    state.failureCount++;

    if (state.failureCount >= this.config.circuitBreakerThreshold) {
      this.openCircuitBreaker(provider);
    }
  }

  /**
   * Start processing retry queue for a provider.
   *
   * @param provider - Tracker provider
   */
  private startQueueProcessing(provider: TrackerProvider): void {
    if (!this.config.enableQueueProcessing) {
      return;
    }

    const interval = setInterval(async () => {
      await this.processRetryQueue(provider);
    }, 5000); // Process every 5 seconds

    this.queueProcessingIntervals.set(provider, interval);
  }

  /**
   * Process retry queue for a provider.
   *
   * @param provider - Tracker provider
   */
  private async processRetryQueue(provider: TrackerProvider): Promise<void> {
    const state = this.getOrCreateState(provider);
    const now = Date.now();

    // Filter items ready for retry
    const readyItems = state.retryQueue.filter(
      item => item.nextRetryAt.getTime() <= now
    );

    for (const item of readyItems) {
      try {
        const result = await item.operation();
        item.resolve(result);

        // Remove from queue
        const index = state.retryQueue.indexOf(item);
        if (index !== -1) {
          state.retryQueue.splice(index, 1);
        }
      } catch (error) {
        item.attempt++;

        if (item.attempt >= this.config.maxRetries) {
          // Max retries reached
          item.reject(
            new MaxRetriesExceededError(
              `Max retries exceeded for queued operation`,
              provider,
              error as Error
            )
          );

          // Remove from queue
          const index = state.retryQueue.indexOf(item);
          if (index !== -1) {
            state.retryQueue.splice(index, 1);
          }
        } else {
          // Schedule next retry
          const delay = this.calculateBackoffDelay(item.attempt);
          item.nextRetryAt = new Date(now + delay);
          item.error = error as Error;
        }
      }
    }

    // Stop processing if queue is empty
    if (state.retryQueue.length === 0) {
      const interval = this.queueProcessingIntervals.get(provider);
      if (interval) {
        clearInterval(interval);
        this.queueProcessingIntervals.delete(provider);
      }
    }
  }

  /**
   * Sleep for a duration.
   *
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique ID.
   *
   * @returns Unique identifier
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    // Clear all queue processing intervals
    for (const interval of this.queueProcessingIntervals.values()) {
      clearInterval(interval);
    }
    this.queueProcessingIntervals.clear();

    // Clear provider states
    this.providerStates.clear();
  }
}

/**
 * Error thrown when circuit breaker is open.
 */
export class CircuitBreakerOpenError extends Error {
  /** Provider with open circuit breaker */
  public readonly provider: TrackerProvider;

  /**
   * Creates a new circuit breaker open error.
   *
   * @param message - Error message
   * @param provider - Tracker provider
   */
  constructor(message: string, provider: TrackerProvider) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.provider = provider;
  }
}

/**
 * Error thrown when max retries are exceeded.
 */
export class MaxRetriesExceededError extends Error {
  /** Provider that exceeded retries */
  public readonly provider: TrackerProvider;
  /** Original error */
  public readonly originalError?: Error;

  /**
   * Creates a new max retries exceeded error.
   *
   * @param message - Error message
   * @param provider - Tracker provider
   * @param originalError - Original error that caused retries
   */
  constructor(message: string, provider: TrackerProvider, originalError?: Error) {
    super(message);
    this.name = 'MaxRetriesExceededError';
    this.provider = provider;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when retry queue is full.
 */
export class QueueFullError extends Error {
  /** Provider with full queue */
  public readonly provider: TrackerProvider;

  /**
   * Creates a new queue full error.
   *
   * @param message - Error message
   * @param provider - Tracker provider
   */
  constructor(message: string, provider: TrackerProvider) {
    super(message);
    this.name = 'QueueFullError';
    this.provider = provider;
  }
}

/**
 * Create a singleton rate limit recovery system instance.
 */
let globalRecoverySystem: RateLimitRecoverySystem | undefined;

/**
 * Get the global rate limit recovery system instance.
 *
 * @param config - Configuration for new instance
 * @returns Global recovery system
 */
export function getGlobalRecoverySystem(
  config?: Partial<RateLimitRecoveryConfig>
): RateLimitRecoverySystem {
  if (!globalRecoverySystem) {
    globalRecoverySystem = new RateLimitRecoverySystem(config);
  }
  return globalRecoverySystem;
}
