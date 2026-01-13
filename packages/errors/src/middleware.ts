/**
 * @fileoverview Hono middleware for error handling
 * @module @relay/errors/middleware
 *
 * Provides error handling middleware for Hono.js applications.
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { errorHandler, notFoundHandler } from '@relay/errors/middleware';
 *
 * const app = new Hono();
 *
 * // Add error handling
 * app.onError(errorHandler());
 *
 * // Add 404 handler
 * app.notFound(notFoundHandler());
 * ```
 */

import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import {
  RelayError,
  NotFoundError,
  wrapError,
  isRelayError,
} from './index.js';

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  /**
   * Whether to include stack traces in error responses.
   * Should be false in production.
   */
  includeStack?: boolean;

  /**
   * Custom error logger function.
   * Called for all errors before sending response.
   */
  onError?: (error: RelayError, ctx: Context) => void | Promise<void>;

  /**
   * Transform error before sending response.
   * Useful for sanitizing error messages.
   */
  transformError?: (error: RelayError) => RelayError;

  /**
   * Custom headers to add to error responses.
   */
  headers?: Record<string, string>;
}

/**
 * Create an error handler middleware for Hono.
 *
 * @param config - Error handler configuration
 * @returns Hono ErrorHandler
 *
 * @example
 * ```typescript
 * app.onError(errorHandler({
 *   includeStack: process.env.NODE_ENV !== 'production',
 *   onError: (error, ctx) => {
 *     Sentry.captureException(error);
 *   },
 * }));
 * ```
 */
export function errorHandler(config: ErrorHandlerConfig = {}): ErrorHandler {
  const {
    includeStack = false,
    onError,
    transformError,
    headers = {},
  } = config;

  return async (error: Error, ctx: Context) => {
    // Wrap non-Relay errors
    let relayError = isRelayError(error) ? error : wrapError(error);

    // Apply transformation if provided
    if (transformError) {
      relayError = transformError(relayError);
    }

    // Call error callback
    if (onError) {
      try {
        await onError(relayError, ctx);
      } catch {
        // Ignore errors in error handler
      }
    }

    // Build response body
    const body = relayError.toJSON() as Record<string, unknown>;

    // Add stack trace in development
    if (includeStack && relayError.stack) {
      (body.error as Record<string, unknown>).stack = relayError.stack;
    }

    // Add request ID if available
    const requestId = ctx.req.header('x-request-id') || ctx.get('requestId');
    if (requestId) {
      (body.error as Record<string, unknown>).requestId = requestId;
    }

    // Set custom headers
    for (const [key, value] of Object.entries(headers)) {
      ctx.header(key, value);
    }

    // Add rate limit headers for rate limit errors
    if (relayError.code === 'RATE_LIMIT_EXCEEDED') {
      const retryAfter = (relayError.details as { retryAfter?: number })?.retryAfter ?? 60;
      ctx.header('Retry-After', String(retryAfter));
    }

    return ctx.json(body, relayError.statusCode as 400 | 401 | 403 | 404 | 500);
  };
}

/**
 * Create a 404 not found handler for Hono.
 *
 * @returns Hono NotFoundHandler
 *
 * @example
 * ```typescript
 * app.notFound(notFoundHandler());
 * ```
 */
export function notFoundHandler(): NotFoundHandler {
  return (ctx: Context) => {
    const error = new NotFoundError('Endpoint', {
      path: ctx.req.path,
      method: ctx.req.method,
    });

    return ctx.json(error.toJSON(), 404);
  };
}

/**
 * Middleware to add request ID to context.
 *
 * @returns Hono middleware
 *
 * @example
 * ```typescript
 * app.use(requestIdMiddleware());
 * ```
 */
export function requestIdMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const requestId = ctx.req.header('x-request-id') || crypto.randomUUID();
    ctx.set('requestId', requestId);
    ctx.header('x-request-id', requestId);
    await next();
  };
}

/**
 * Type guard for checking if context has a request ID.
 */
export function hasRequestId(ctx: Context): boolean {
  return Boolean(ctx.get('requestId'));
}

/**
 * Get request ID from context.
 */
export function getRequestId(ctx: Context): string | undefined {
  return ctx.get('requestId');
}

// Re-export error types for convenience
export {
  RelayError,
  NotFoundError,
  wrapError,
  isRelayError,
} from './index.js';
