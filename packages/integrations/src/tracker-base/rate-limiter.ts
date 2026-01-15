/**
 * @fileoverview Rate limiting utilities for tracker API clients.
 * Provides token bucket rate limiting and request queuing.
 * @packageDocumentation
 */

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /** Maximum burst size (defaults to maxRequests) */
  burstSize?: number;
  /** Whether to queue requests that exceed the limit */
  queueExcess?: boolean;
  /** Maximum queue size */
  maxQueueSize?: number;
}

/**
 * Rate limiter state
 */
interface RateLimiterState {
  /** Remaining tokens in current window */
  tokens: number;
  /** Last token refill timestamp */
  lastRefillAt: number;
}

/**
 * Token bucket rate limiter implementation.
 * Supports both blocking and non-blocking modes.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   maxRequests: 100,
 *   windowMs: 60000, // 1 minute
 *   queueExcess: true,
 * });
 *
 * // Blocking mode - waits for rate limit
 * await limiter.acquire();
 *
 * // Non-blocking mode - throws if rate limited
 * if (limiter.tryAcquire()) {
 *   // Make request
 * }
 * ```
 */
export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private state: RateLimiterState;
  private queue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Creates a new rate limiter.
   * @param config - Rate limiter configuration
   */
  constructor(config: RateLimiterConfig) {
    this.config = {
      ...config,
      burstSize: config.burstSize ?? config.maxRequests,
      queueExcess: config.queueExcess ?? false,
      maxQueueSize: config.maxQueueSize ?? 1000,
    };

    this.state = {
      tokens: this.config.burstSize,
      lastRefillAt: Date.now(),
    };
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.state.lastRefillAt;

    if (elapsed > 0) {
      // Calculate tokens to add based on elapsed time
      const tokensToAdd =
        (elapsed / this.config.windowMs) * this.config.maxRequests;
      this.state.tokens = Math.min(
        this.state.tokens + tokensToAdd,
        this.config.burstSize
      );
      this.state.lastRefillAt = now;
    }
  }

  /**
   * Process queued requests.
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.state.tokens >= 1) {
      const request = this.queue.shift()!;
      this.state.tokens--;
      request.resolve();
    }
  }

  /**
   * Try to acquire a token without blocking.
   * @returns True if token was acquired, false if rate limited
   */
  tryAcquire(): boolean {
    this.refillTokens();

    if (this.state.tokens >= 1) {
      this.state.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token, blocking if necessary.
   * @returns Promise that resolves when token is acquired
   * @throws Error if queue is full and excess queuing is disabled
   */
  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.state.tokens >= 1) {
      this.state.tokens--;
      return;
    }

    if (!this.config.queueExcess) {
      throw new RateLimitError(
        'Rate limit exceeded',
        this.getTimeUntilNextToken()
      );
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitError(
        'Rate limit queue full',
        this.getTimeUntilNextToken()
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });

      // Schedule queue processing
      const timeUntilToken = this.getTimeUntilNextToken();
      setTimeout(() => {
        this.refillTokens();
        this.processQueue();
      }, timeUntilToken);
    });
  }

  /**
   * Get time until next token is available.
   * @returns Time in milliseconds
   */
  getTimeUntilNextToken(): number {
    this.refillTokens();

    if (this.state.tokens >= 1) {
      return 0;
    }

    // Calculate time needed for one token
    const tokensNeeded = 1 - this.state.tokens;
    const timePerToken = this.config.windowMs / this.config.maxRequests;
    return Math.ceil(tokensNeeded * timePerToken);
  }

  /**
   * Get remaining tokens.
   * @returns Number of available tokens
   */
  getRemainingTokens(): number {
    this.refillTokens();
    return Math.floor(this.state.tokens);
  }

  /**
   * Get current queue size.
   * @returns Number of queued requests
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Reset the rate limiter to initial state.
   */
  reset(): void {
    this.state = {
      tokens: this.config.burstSize,
      lastRefillAt: Date.now(),
    };

    // Reject all queued requests
    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      request.reject(new Error('Rate limiter reset'));
    }
  }

  /**
   * Create a rate limiter for common tracker limits.
   */
  static forTracker(
    tracker: 'linear' | 'trello' | 'asana' | 'monday' | 'clickup' | 'notion' | 'wrike' | 'shortcut' | 'basecamp'
  ): RateLimiter {
    const configs: Record<string, RateLimiterConfig> = {
      linear: { maxRequests: 1500, windowMs: 60000 }, // 1500/min
      trello: { maxRequests: 100, windowMs: 10000 }, // 100/10s
      asana: { maxRequests: 1500, windowMs: 60000 }, // 1500/min
      monday: { maxRequests: 5000, windowMs: 60000 }, // 5000/min (complexity-based)
      clickup: { maxRequests: 100, windowMs: 60000 }, // 100/min (Free tier)
      notion: { maxRequests: 3, windowMs: 1000 }, // 3/s
      wrike: { maxRequests: 400, windowMs: 60000 }, // 400/min
      shortcut: { maxRequests: 200, windowMs: 60000 }, // 200/min (estimate)
      basecamp: { maxRequests: 50, windowMs: 10000 }, // 50/10s
    };

    const config = configs[tracker];
    if (!config) {
      throw new Error(`Unknown tracker: ${tracker}`);
    }

    return new RateLimiter({
      ...config,
      queueExcess: true,
      maxQueueSize: 100,
    });
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends Error {
  /** Time until rate limit resets in milliseconds */
  public readonly retryAfterMs: number;

  /**
   * Creates a new rate limit error.
   * @param message - Error message
   * @param retryAfterMs - Time until rate limit resets
   */
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * GraphQL complexity tracker for APIs like Linear and Monday.
 */
export class ComplexityTracker {
  private remaining: number;
  private limit: number;
  private resetAt: Date;

  /**
   * Creates a new complexity tracker.
   * @param limit - Maximum complexity points per window
   */
  constructor(limit: number) {
    this.limit = limit;
    this.remaining = limit;
    this.resetAt = new Date(Date.now() + 60000);
  }

  /**
   * Check if a query with given complexity can be executed.
   * @param complexity - Query complexity cost
   * @returns True if query can be executed
   */
  canExecute(complexity: number): boolean {
    this.maybeReset();
    return this.remaining >= complexity;
  }

  /**
   * Record complexity usage.
   * @param complexity - Complexity used
   */
  recordUsage(complexity: number): void {
    this.remaining = Math.max(0, this.remaining - complexity);
  }

  /**
   * Update state from API response headers.
   * @param remaining - Remaining complexity
   * @param resetAt - Reset timestamp
   */
  updateFromResponse(remaining: number, resetAt: Date): void {
    this.remaining = remaining;
    this.resetAt = resetAt;
  }

  /**
   * Get remaining complexity.
   */
  getRemaining(): number {
    this.maybeReset();
    return this.remaining;
  }

  /**
   * Reset if window has passed.
   */
  private maybeReset(): void {
    if (Date.now() >= this.resetAt.getTime()) {
      this.remaining = this.limit;
      this.resetAt = new Date(Date.now() + 60000);
    }
  }
}
