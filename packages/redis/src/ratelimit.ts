import type Redis from 'ioredis';
import type { RateLimitOptions, RateLimitResult } from './types';

/**
 * Rate limiter using Redis sliding window algorithm.
 */
export class RateLimiter {
  private client: Redis;
  private keyPrefix: string;

  /**
   * Creates a new RateLimiter instance.
   * @param client - Redis client instance
   * @param options - Rate limiter options
   */
  constructor(
    client: Redis,
    options?: {
      keyPrefix?: string;
    }
  ) {
    this.client = client;
    this.keyPrefix = options?.keyPrefix ?? 'ratelimit:';
  }

  /**
   * Builds a rate limit key.
   * @param identifier - The identifier (e.g., user ID, IP)
   * @param action - The action being rate limited
   * @returns The prefixed key
   */
  private buildKey(identifier: string, action: string): string {
    return `${this.keyPrefix}${action}:${identifier}`;
  }

  /**
   * Checks if a request is allowed under the rate limit.
   * Uses sliding window log algorithm.
   * @param identifier - The identifier (e.g., user ID, IP)
   * @param action - The action being rate limited
   * @param options - Rate limit options
   * @returns Rate limit result
   */
  public async check(
    identifier: string,
    action: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const key = this.buildKey(identifier, action);
    const now = Date.now();
    const windowStart = now - options.windowSeconds * 1000;

    // Remove old entries and count current entries
    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);

    const results = await pipeline.exec();

    if (!results) {
      return {
        allowed: true,
        remaining: options.max,
        limit: options.max,
        resetInSeconds: options.windowSeconds,
      };
    }

    const count = (results[1]?.[1] as number) ?? 0;
    const remaining = Math.max(0, options.max - count);

    if (count >= options.max) {
      // Get the oldest entry to calculate reset time
      const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTime = oldest.length > 1 ? parseInt(oldest[1], 10) : now;
      const resetInSeconds = Math.ceil((oldestTime + options.windowSeconds * 1000 - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        limit: options.max,
        resetInSeconds: Math.max(1, resetInSeconds),
        retryAfterSeconds: Math.max(1, resetInSeconds),
      };
    }

    return {
      allowed: true,
      remaining,
      limit: options.max,
      resetInSeconds: options.windowSeconds,
    };
  }

  /**
   * Records a request and checks if it's allowed.
   * @param identifier - The identifier (e.g., user ID, IP)
   * @param action - The action being rate limited
   * @param options - Rate limit options
   * @returns Rate limit result
   */
  public async consume(
    identifier: string,
    action: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const key = this.buildKey(identifier, action);
    const now = Date.now();
    const windowStart = now - options.windowSeconds * 1000;
    const uniqueId = `${now}:${Math.random().toString(36).substring(2)}`;

    // Remove old entries, add new one, count entries
    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, uniqueId);
    pipeline.zcard(key);
    pipeline.expire(key, options.windowSeconds);

    const results = await pipeline.exec();

    if (!results) {
      return {
        allowed: true,
        remaining: options.max - 1,
        limit: options.max,
        resetInSeconds: options.windowSeconds,
      };
    }

    const count = (results[2]?.[1] as number) ?? 1;

    if (count > options.max) {
      // Remove the entry we just added since it exceeded the limit
      await this.client.zrem(key, uniqueId);

      const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
      const oldestTime = oldest.length > 1 ? parseInt(oldest[1], 10) : now;
      const resetInSeconds = Math.ceil((oldestTime + options.windowSeconds * 1000 - now) / 1000);

      return {
        allowed: false,
        remaining: 0,
        limit: options.max,
        resetInSeconds: Math.max(1, resetInSeconds),
        retryAfterSeconds: Math.max(1, resetInSeconds),
      };
    }

    return {
      allowed: true,
      remaining: options.max - count,
      limit: options.max,
      resetInSeconds: options.windowSeconds,
    };
  }

  /**
   * Resets the rate limit for an identifier.
   * @param identifier - The identifier
   * @param action - The action
   * @returns True if key was deleted
   */
  public async reset(identifier: string, action: string): Promise<boolean> {
    const key = this.buildKey(identifier, action);
    const result = await this.client.del(key);
    return result > 0;
  }

  /**
   * Gets the current count for an identifier.
   * @param identifier - The identifier
   * @param action - The action
   * @param windowSeconds - Window duration
   * @returns Current count
   */
  public async getCount(
    identifier: string,
    action: string,
    windowSeconds: number
  ): Promise<number> {
    const key = this.buildKey(identifier, action);
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    await this.client.zremrangebyscore(key, 0, windowStart);
    return this.client.zcard(key);
  }
}

/**
 * Creates a new RateLimiter instance.
 * @param client - Redis client instance
 * @param options - Rate limiter options
 * @returns RateLimiter instance
 */
export function createRateLimiter(
  client: Redis,
  options?: {
    keyPrefix?: string;
  }
): RateLimiter {
  return new RateLimiter(client, options);
}
