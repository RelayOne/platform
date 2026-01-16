/**
 * @fileoverview Rate limiting middleware for Relay Platform
 * @module @relay/rate-limit
 *
 * Provides distributed rate limiting using Redis when available,
 * with automatic fallback to in-memory storage for development.
 * Designed for Vercel serverless deployment and Hono framework.
 */

import { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import type Redis from 'ioredis';

/**
 * In-memory store for rate limit tracking (fallback).
 * Used when Redis is not available.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limit configuration options.
 */
export interface RateLimitOptions {
  /** Maximum requests per window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key generator function (defaults to IP address) */
  keyGenerator?: (c: Context) => string;
  /** Skip function to bypass rate limiting */
  skip?: (c: Context) => boolean;
  /** Custom message for rate limit exceeded */
  message?: string;
  /** Redis client for distributed rate limiting (optional) */
  redis?: Redis | null;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Current request count */
  count: number;
  /** Remaining requests in window */
  remaining: number;
  /** Seconds until window reset */
  resetTime: number;
}

/**
 * Default rate limit configurations.
 */
export const RATE_LIMITS = {
  /** Standard API endpoints - 100 requests per minute */
  standard: { max: 100, windowMs: 60 * 1000 },
  /** Authentication endpoints - 10 attempts per minute */
  auth: { max: 10, windowMs: 60 * 1000 },
  /** Strict endpoints (password reset, etc.) - 5 requests per 15 minutes */
  strict: { max: 5, windowMs: 15 * 60 * 1000 },
  /** File upload endpoints - 20 uploads per minute */
  upload: { max: 20, windowMs: 60 * 1000 },
  /** Webhook endpoints - 1000 requests per minute (internal use) */
  webhook: { max: 1000, windowMs: 60 * 1000 },
} as const;

/**
 * Gets the client IP address from request headers.
 * @param c - Hono context
 * @returns Client IP address
 */
export function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    c.req.header('cf-connecting-ip') ||
    'unknown'
  );
}

/**
 * Cleans up expired rate limit entries from in-memory store.
 * Called periodically to prevent memory leaks.
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > 60 * 60 * 1000) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Checks if Redis client is ready and connected.
 * @param redis - Redis client
 * @returns Whether Redis is ready
 */
function isRedisReady(redis?: Redis | null): redis is Redis {
  if (!redis) return false;
  return redis.status === 'ready' || redis.status === 'connect';
}

/**
 * Checks rate limit using Redis.
 * @param redis - Redis client
 * @param key - Rate limit key
 * @param max - Maximum requests
 * @param windowMs - Window duration in ms
 * @returns Rate limit result
 */
export async function checkRedisRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redisKey = `ratelimit:${key}`;
  const windowSeconds = Math.ceil(windowMs / 1000);

  try {
    // Use Redis MULTI for atomic operations
    const pipeline = redis.multi();

    // Increment counter
    pipeline.incr(redisKey);
    // Set expiry if new key
    pipeline.expire(redisKey, windowSeconds, 'NX');
    // Get TTL for reset time
    pipeline.ttl(redisKey);

    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Redis pipeline failed');
    }

    const count = (results[0][1] as number) || 0;
    const ttl = (results[2][1] as number) || windowSeconds;

    const remaining = Math.max(0, max - count);
    const resetTime = ttl > 0 ? ttl : windowSeconds;

    return { count, remaining, resetTime };
  } catch (error) {
    console.error('Redis rate limit error:', error);
    throw error;
  }
}

/**
 * Checks rate limit using in-memory store.
 * @param key - Rate limit key
 * @param max - Maximum requests
 * @param windowMs - Window duration in ms
 * @returns Rate limit result
 */
export function checkMemoryRateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  const remaining = Math.max(0, max - entry.count);
  const resetTime = Math.ceil((entry.windowStart + windowMs - now) / 1000);

  return { count: entry.count, remaining, resetTime };
}

/**
 * Creates a rate limiting middleware.
 * Uses Redis when available, falls back to in-memory storage.
 * @param options - Rate limit configuration
 * @returns Hono middleware function
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    max,
    windowMs,
    keyGenerator = getClientIp,
    skip,
    message = 'Too many requests, please try again later',
    redis,
  } = options;

  return createMiddleware(async (c: Context, next: Next) => {
    // Skip rate limiting if skip function returns true
    if (skip?.(c)) {
      return next();
    }

    const key = keyGenerator(c);
    let count: number;
    let remaining: number;
    let resetTime: number;

    // Try Redis first, fall back to memory
    if (isRedisReady(redis)) {
      try {
        const result = await checkRedisRateLimit(redis, key, max, windowMs);
        count = result.count;
        remaining = result.remaining;
        resetTime = result.resetTime;
      } catch {
        const result = checkMemoryRateLimit(key, max, windowMs);
        count = result.count;
        remaining = result.remaining;
        resetTime = result.resetTime;
      }
    } else {
      const result = checkMemoryRateLimit(key, max, windowMs);
      count = result.count;
      remaining = result.remaining;
      resetTime = result.resetTime;
    }

    // Set rate limit headers
    c.res.headers.set('X-RateLimit-Limit', max.toString());
    c.res.headers.set('X-RateLimit-Remaining', remaining.toString());
    c.res.headers.set('X-RateLimit-Reset', resetTime.toString());

    // Check if rate limit exceeded
    if (count > max) {
      c.res.headers.set('Retry-After', resetTime.toString());
      return c.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: resetTime,
        },
        429
      );
    }

    return next();
  });
}

/**
 * Rate limiter for standard API endpoints.
 * 100 requests per minute.
 * @param redis - Optional Redis client
 * @returns Hono middleware
 */
export function standardRateLimit(redis?: Redis | null) {
  return rateLimit({ ...RATE_LIMITS.standard, redis });
}

/**
 * Rate limiter for authentication endpoints.
 * 10 attempts per minute to prevent brute force.
 * @param redis - Optional Redis client
 * @returns Hono middleware
 */
export function authRateLimit(redis?: Redis | null) {
  return rateLimit({
    ...RATE_LIMITS.auth,
    message: 'Too many authentication attempts, please try again later',
    redis,
  });
}

/**
 * Rate limiter for strict endpoints (password reset, etc.).
 * 5 requests per 15 minutes.
 * @param redis - Optional Redis client
 * @returns Hono middleware
 */
export function strictRateLimit(redis?: Redis | null) {
  return rateLimit({
    ...RATE_LIMITS.strict,
    message: 'Too many requests for this action, please wait before trying again',
    redis,
  });
}

/**
 * Rate limiter for file upload endpoints.
 * 20 uploads per minute.
 * @param redis - Optional Redis client
 * @returns Hono middleware
 */
export function uploadRateLimit(redis?: Redis | null) {
  return rateLimit({
    ...RATE_LIMITS.upload,
    message: 'Too many uploads, please wait before uploading more files',
    redis,
  });
}

/**
 * Rate limiter combining IP and user ID for authenticated endpoints.
 * Uses both IP and user ID to prevent distributed attacks.
 * @param options - Rate limit options
 * @returns Hono middleware
 */
export function userRateLimit(options: RateLimitOptions) {
  return rateLimit({
    ...options,
    keyGenerator: (c: Context) => {
      const userId = c.get('user')?.sub;
      const ip = getClientIp(c);
      return userId ? `user:${userId}` : `ip:${ip}`;
    },
  });
}

/**
 * Creates a tiered rate limiter that allows higher limits for authenticated users.
 * @param unauthenticatedLimit - Limit for unauthenticated requests
 * @param authenticatedLimit - Limit for authenticated requests
 * @param windowMs - Window duration in milliseconds
 * @param redis - Optional Redis client
 * @returns Hono middleware
 */
export function tieredRateLimit(
  unauthenticatedLimit: number,
  authenticatedLimit: number,
  windowMs: number,
  redis?: Redis | null
) {
  return createMiddleware(async (c: Context, next: Next) => {
    const userId = c.get('user')?.sub;
    const limit = userId ? authenticatedLimit : unauthenticatedLimit;
    const key = userId ? `user:${userId}` : `ip:${getClientIp(c)}`;

    let count: number;
    let remaining: number;
    let resetTime: number;

    // Try Redis first, fall back to memory
    if (isRedisReady(redis)) {
      try {
        const result = await checkRedisRateLimit(redis, key, limit, windowMs);
        count = result.count;
        remaining = result.remaining;
        resetTime = result.resetTime;
      } catch {
        const result = checkMemoryRateLimit(key, limit, windowMs);
        count = result.count;
        remaining = result.remaining;
        resetTime = result.resetTime;
      }
    } else {
      const result = checkMemoryRateLimit(key, limit, windowMs);
      count = result.count;
      remaining = result.remaining;
      resetTime = result.resetTime;
    }

    c.res.headers.set('X-RateLimit-Limit', limit.toString());
    c.res.headers.set('X-RateLimit-Remaining', remaining.toString());
    c.res.headers.set('X-RateLimit-Reset', resetTime.toString());

    if (count > limit) {
      c.res.headers.set('Retry-After', resetTime.toString());
      return c.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          retryAfter: resetTime,
        },
        429
      );
    }

    return next();
  });
}

/**
 * Setup periodic cleanup for in-memory rate limit store.
 * Call this once at application startup if using in-memory storage.
 * @param intervalMs - Cleanup interval in milliseconds (default: 5 minutes)
 * @returns Cleanup interval ID
 */
export function setupRateLimitCleanup(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout | null {
  if (typeof setInterval === 'undefined') {
    return null;
  }
  return setInterval(cleanupExpiredEntries, intervalMs);
}
